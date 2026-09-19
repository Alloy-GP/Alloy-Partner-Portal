import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs a Monday "<Client> Q2" board into the portal's read tables:
//   Active Projects + Strategy & Reporting + Completed* + Historical + Ongoing -> projects
//   Tickets group, Monday Status in ACTION_STATUSES               -> action_items
//   Toolkit group                                                 -> toolkit_systems
// Trigger: Monday webhook (real-time) on board change, or a manual call.
//
// Every client board is built from the same TEMPLATE — same group titles and
// column titles/types — but Monday generates fresh ids per board. So we never
// hardcode ids: we read the board's metadata and resolve groups by title and
// columns by title+type. This works for any client board following the layout.
//
// Reliability contract (the monday-daily cron fires this every 30 min):
//   - boards run STALEST FIRST inside a time budget (RUN_BUDGET_MS); boards that
//     don't fit are reported as skipped and lead the next tick;
//   - one board's failure is recorded in the summary and never stops the others
//     (response ok:false, failed:N - the watchdog alerts if it persists);
//   - each board's rows + sync stamp are swapped in ONE transaction
//     (monday_replace_account_rows), so a failure mid-board can never empty a
//     client's Projects page;
//   - Monday calls time out at 30s and retry rate/complexity limits with backoff.

const MONDAY_API = "https://api.monday.com/v2";
// Realtime events we register per main board. Keep in sync with admin/index.ts
// (ensureMondayWebhooks); "reconcile" below deletes+recreates exactly this set.
const WEBHOOK_EVENTS = ["change_column_value", "create_item", "item_deleted", "change_subitem_column_value", "create_subitem"];
// The set registered on every Growth Roadmap board (-> sync-monday-roadmap). No
// create_subitem: that function creates the milestone subitems itself.
const ROADMAP_WEBHOOK_EVENTS = ["change_column_value", "create_item", "item_deleted", "change_subitem_column_value"];

// Group titles (matched case-insensitively, trimmed).
const PROJECT_GROUP_TITLES = new Set(["active projects", "strategy & reporting"]);
const TICKETS_GROUP_TITLE = "tickets";
const isCompletedTitle = (t: string) => /^completed\b/i.test((t || "").trim());
// Historical = the per-client archive of past/delivered work (so the roadmap's
// past-quarter cards can show real data). Treated exactly like "Completed":
// forced status "live", so archived work is counted as delivered and can NEVER
// leak into the "in motion" (active) count.
const isHistoricalTitle = (t: string) => /^historical\b/i.test((t || "").trim());
// Planned work = future/queued items (the Account page "On the horizon"). Synced
// into projects with a forced status of "planned" so they stay out of the active
// project views (loadData splits them into DATA.plannedProjects).
const isPlannedTitle = (t: string) => /^planned\b/i.test((t || "").trim());

// Monday Status (source of truth, set by the Zendesk->Monday automation) that
// surfaces a ticket in the action queue.
const ACTION_STATUSES = new Set(["Review"]);
// Status labels that mean a ticket is finished (shown in completed work).
const DONE_TICKET_STATUSES = new Set(["Completed", "Complete", "Solved", "solved"]);
// Subtask statuses that count as "done" for the stage-progress bar.
const DONE_SUBTASK = new Set(["Completed", "Complete", "Done", "Solved", "solved"]);

const ZENDESK_BASE = "https://alloycreatives.zendesk.com";

// Project status map. "Review" is intentionally NOT a project status — review
// is a ticket concept (the action queue). "Waiting" IS its own status so it can
// be filtered/labeled distinctly on the projects page.
const STATUS_MAP: Record<string, [string, number]> = {
  "Planning": ["planning", 10],
  "Not Started": ["planning", 5],
  "Assigned": ["assigned", 30],
  "In-Progress": ["in-progress", 60],
  "Waiting": ["waiting", 60],
  "Review": ["in-progress", 60],
  "Reprioritized / Hold": ["planning", 20],
  "Completed": ["live", 100],
  "Complete": ["live", 100],
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function initials(name: string): string {
  return name.trim().split(" ").filter(Boolean).map((w) => w[0]?.toUpperCase() || "").join("").slice(0, 2);
}
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function cols(item: any): Record<string, string> {
  const cv: Record<string, string> = {};
  for (const c of item.column_values) cv[c.id] = c.text ?? "";
  return cv;
}
// The Zendesk integration column stores its ticket ref in `value` (JSON), not
// `text`: {"entity_id": 6428, "api_ticket_url": "..."}.
function zendeskRef(item: any, zendeskColId: string | null): { id: string | null; url: string | null } {
  if (!zendeskColId) return { id: null, url: null };
  const c = item.column_values.find((x: any) => x.id === zendeskColId);
  if (!c || !c.value) return { id: null, url: null };
  try {
    const v = JSON.parse(c.value);
    if (v && v.entity_id) {
      return { id: String(v.entity_id), url: `${ZENDESK_BASE}/agent/tickets/${v.entity_id}` };
    }
  } catch { /* ignore */ }
  return { id: null, url: null };
}

// --- Board metadata: resolve group + column ids by title/type (no hardcoding).
const META_QUERY = `
  query ($board: [ID!]) {
    boards(ids: $board) {
      groups { id title }
      columns { id title type }
    }
  }`;

type ColMap = {
  status: string | null; due: string | null; person: string | null;
  category: string | null; taskId: string | null; zendesk: string | null; link: string | null;
  workType: string | null;
};

// A Monday "link" column stores { url, text } in `value`. Pull the URL (the
// client-facing review/Pastel link). Falls back to the first URL in the text.
function linkUrl(item: any, colId: string | null): string | null {
  if (!colId) return null;
  const c = item.column_values.find((x: any) => x.id === colId);
  if (!c) return null;
  if (c.value) {
    try { const v = JSON.parse(c.value); if (v && v.url) return String(v.url); } catch { /* ignore */ }
  }
  // Text fallback: Monday serializes link text as "Label - https://…".
  const t = (c.text || "").trim();
  const idx = t.lastIndexOf("http");
  return idx >= 0 ? t.slice(idx).split(" ")[0] : null;
}

// The link column's "text to display" ({ url, text }). Used as the ticket card's
// review-button label. Falls back to the label half of "Label - https://…".
function linkText(item: any, colId: string | null): string | null {
  if (!colId) return null;
  const c = item.column_values.find((x: any) => x.id === colId);
  if (!c) return null;
  if (c.value) {
    try { const v = JSON.parse(c.value); if (v && v.text) return String(v.text).trim() || null; } catch { /* ignore */ }
  }
  const t = (c.text || "").trim();
  const idx = t.lastIndexOf("http");
  if (idx > 0) { const lbl = t.slice(0, idx).replace(/[-–—\s]+$/, "").trim(); return lbl || null; }
  return null;
}

// Stage progress = subtasks marked done / total subtasks. Returns null when the
// item has no subtasks (caller falls back to the status-derived pct). The
// subitem board's Status column id varies per board, so detect it by type.
function subtaskPct(item: any): number | null {
  const subs = item.subitems || [];
  if (!subs.length) return null;
  let done = 0;
  for (const s of subs) {
    const cv = (s.column_values || []).find((c: any) => c.column && (c.column.type === "status" || c.column.type === "color"));
    if (cv && DONE_SUBTASK.has(((cv.text || "")).trim())) done++;
  }
  return Math.round((done / subs.length) * 100);
}

// Subtask checklist (Monday subitems) for the Playbook row pill.
// Status comes from the subitem's status column (type "status"/"color") — its id
// is prefixed with the subitems-board id and differs per board, so resolve BY TYPE.
function subState(text: string): "done" | "active" | "todo" {
  const t = (text || "").trim().toLowerCase();
  if (DONE_SUBTASK.has((text || "").trim()) || t === "done") return "done";
  if (t.includes("progress")) return "active"; // "In-Progress"
  return "todo"; // Not Started, Reprioritized / Hold, blank, etc.
}
// Strip leading Monday ordinal prefixes: "a. Project setup" -> "Project setup",
// "c1. Build page – /" -> "Build page – /".
function stripOrdinal(name: string): string {
  return (name || "").replace(/^[a-z]?\d*\.\s*/i, "").trim();
}
function mapSubtasks(item: any): Array<{ label: string; state: string }> {
  const subs = item.subitems || [];
  return subs
    .map((s: any) => {
      const cv = (s.column_values || []).find((c: any) => c.column && (c.column.type === "status" || c.column.type === "color"));
      return { label: stripOrdinal(s.name), state: subState(cv ? cv.text : "") };
    })
    .filter((x: any) => x.label);
}

function resolveColumns(columns: any[]): ColMap {
  const norm = (s: string) => (s || "").trim().toLowerCase();
  const byTitle = (title: string, type?: string) =>
    columns.find((c) => norm(c.title) === title && (!type || c.type === type));
  const zendesk =
    columns.find((c) => c.type === "integration" && norm(c.title).includes("zendesk")) ||
    columns.find((c) => c.type === "integration");
  return {
    status: byTitle("status", "status")?.id ?? null,
    due: byTitle("due", "date")?.id ?? null,
    person: (byTitle("owner", "people") || columns.find((c) => c.type === "people"))?.id ?? null,
    category: byTitle("category", "status")?.id ?? null,
    taskId: byTitle("task id", "text")?.id ?? null,
    zendesk: zendesk?.id ?? null,
    link: byTitle("link", "link")?.id ?? null,
    workType: byTitle("type", "status")?.id ?? null, // origin: "Playbook"=planned, else added
  };
}

// Run budget for one invocation. Supabase's gateway closes a function request
// that has sent no bytes for 150s: pg_net records a timeout, the watchdog a
// failed run, while the isolate keeps writing in the background. So a slow
// Monday morning made monday-daily "fail" although most boards had landed.
// 110s leaves room for the last board's retries and the response itself.
const RUN_BUDGET_MS = 110_000;

// One Monday API call, hardened for an unattended sync:
//   - a 30s per-call timeout, so one hung request can't eat the whole run;
//   - retries (QUERIES only - a retried mutation could double-create) on
//     network errors, HTTP 429/5xx and Monday's complexity / rate-limit errors,
//     honouring the wait Monday states ("retry_in_seconds", "reset in N
//     seconds") else 1s / 2s, capped at 20s;
//   - never retries past `deadline` (the run budget): the gateway would kill
//     the caller anyway, and the next tick picks this board up first.
const MONDAY_CALL_TIMEOUT_MS = 30_000;
const MONDAY_ATTEMPTS = 3;
class MondayError extends Error {
  retryable: boolean;
  retryAfterMs: number;
  constructor(message: string, retryable: boolean, retryAfterMs = 0) {
    super(message); this.retryable = retryable; this.retryAfterMs = retryAfterMs;
  }
}
async function monday(token: string, query: string, variables: Record<string, unknown>, deadline = Infinity) {
  const idempotent = !/^\s*mutation\b/.test(query);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(MONDAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token, "API-Version": "2024-10" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(MONDAY_CALL_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
        throw new MondayError(`Monday HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, true, retryAfter);
      }
      const json = await res.json();
      // GraphQL errors arrive in `errors`; older-style limit errors as a
      // top-level { error_code, error_message } object on a 200.
      if (json.errors || json.error_code || json.error_message) {
        const text = JSON.stringify(json.errors ?? json);
        const limited = /complexity|rate.?limit|too many|internal server error|timeout/i.test(text);
        const m = /retry_in_seconds\D{0,5}(\d+)|reset in (\d+) second/i.exec(text);
        throw new MondayError("Monday API error: " + text, limited, m ? Number(m[1] ?? m[2]) * 1000 : 0);
      }
      return json.data;
    } catch (e) {
      const retryable = e instanceof MondayError ? e.retryable : true; // network / abort / bad JSON
      const wait = Math.min(20_000, (e instanceof MondayError && e.retryAfterMs) || 1000 * 2 ** (attempt - 1));
      if (!idempotent || !retryable || attempt >= MONDAY_ATTEMPTS || Date.now() + wait > deadline - 5_000) throw e;
      console.warn(`monday: attempt ${attempt} failed - ${String(e).slice(0, 200)} - retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Write one account's mirror rows. Preferred path: ONE transaction via the
// monday_replace_account_rows RPC (20260919210000_monday_replace_account_rows.sql)
// so a failure mid-way can't leave a client's Projects page empty, and the sync
// stamp lands only with the rows it describes. If that migration isn't applied
// yet (PGRST202) fall back to the old five delete+insert round trips - not
// atomic, so it says so (write:"legacy") and warns in the logs. Apply the
// migration BEFORE deploying this function and that path is never taken.
type MirrorRows = { projects: any[]; actions: any[]; ticketLinks: any[]; toolkit: any[] };
async function replaceAccountRows(supabase: any, accountId: string, rows: MirrorRows, boardItems: number, syncedRows: number): Promise<"atomic" | "legacy"> {
  const { error } = await supabase.rpc("monday_replace_account_rows", {
    p_account_id: accountId, p_projects: rows.projects, p_actions: rows.actions,
    p_ticket_links: rows.ticketLinks, p_toolkit: rows.toolkit, p_board_items: boardItems, p_synced_rows: syncedRows,
  });
  if (!error) return "atomic";
  if (error.code !== "PGRST202") throw new Error(`replace rows: ${error.message}`);
  console.warn("monday_replace_account_rows is missing (apply migration 20260919210000); writing non-atomically");
  const tables: Array<[string, any[]]> = [
    ["projects", rows.projects], ["recurring_services", []], ["action_items", rows.actions],
    ["ticket_links", rows.ticketLinks], ["toolkit_systems", rows.toolkit],
  ];
  for (const [table, list] of tables) {
    const { error: delErr } = await supabase.from(table).delete().eq("account_id", accountId);
    if (delErr) throw new Error(`${table} delete: ${delErr.message}`);
    if (list.length) {
      const { error: insErr } = await supabase.from(table).insert(list);
      if (insErr) throw new Error(`${table} insert: ${insErr.message}`);
    }
  }
  const { error: stErr } = await supabase.from("monday_sync_status")
    .upsert({ account_id: accountId, board_items: boardItems, synced_rows: syncedRows, synced_at: new Date().toISOString() });
  if (stErr) throw new Error(`monday_sync_status: ${stErr.message}`);
  return "legacy";
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    if (body && body.challenge) return Response.json({ challenge: body.challenge });

    // AUTH — FAIL CLOSED. This was `if (expected && provided !== expected)`: dormant
    // while SYNC_SECRET was unset, then armed the day the secret was created
    // (2026-08-17) — and every caller that sent no secret has 401'd since.
    // For this function that was the 30-min cron AND every Monday webhook: the
    // portal sat on 23-day-old boards while Sync Health said so in red.
    // Accept the secret from the x-sync-secret header (cron; stays out of URL logs)
    // or ?secret= (Monday webhooks can't send headers). An unset secret means
    // "nobody", never "everybody".
    const secret = Deno.env.get("SYNC_SECRET") || "";
    const provided = req.headers.get("x-sync-secret") || url.searchParams.get("secret") || "";
    if (!secret || provided !== secret) {
      return new Response("unauthorized", { status: 401 });
    }

    const token = (Deno.env.get("MONDAY_API_TOKEN") || "").trim();
    if (!token) return new Response("MONDAY_API_TOKEN not set", { status: 500 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Webhook maintenance (secret-gated, ops-only) ─────────────────────────
    // Monday can't send headers, so a webhook proves itself with ?secret= in its
    // URL. The webhooks admin registered before 2026-08-17 carry no secret and
    // have been rejected ever since. Monday's API does not expose a webhook's
    // URL, so "list" shows what's registered (event per board) and "reconcile"
    // replaces THIS function's event set on each main board with fresh
    // registrations that carry the secret. Only the target's own event set is
    // touched; anything else on the board is left alone. `boards` (list only)
    // overrides the account boards. `target`: "main" (default) = each account's
    // main board -> this function; "roadmap" = each Growth Roadmap board ->
    // sync-monday-roadmap (same outage, same fix, different URL + event set).
    if (body?.webhooks === "list" || body?.webhooks === "reconcile") {
      const target = body.target === "roadmap" ? "roadmap" : "main";
      const col = target === "roadmap" ? "monday_roadmap_board_id" : "monday_board_id";
      const fn = target === "roadmap" ? "sync-monday-roadmap" : "sync-monday";
      const events = target === "roadmap" ? ROADMAP_WEBHOOK_EVENTS : WEBHOOK_EVENTS;
      const { data: accts } = await supabase
        .from("accounts").select(`id, short_name, ${col}`).not(col, "is", null);
      const accountBoards = (accts ?? []).map((a: any) => String(a[col]));
      const boards: string[] = body.webhooks === "list" && Array.isArray(body.boards) && body.boards.length
        ? body.boards.map(String) : accountBoards;
      const nameOf = new Map((accts ?? []).map((a: any) => [String(a[col]), a.short_name]));
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}?secret=${encodeURIComponent(secret)}`;
      const LIST = `query ($b: ID!) { webhooks(board_id: $b) { id event } }`;
      const report: any[] = [];
      for (const b of boards) {
        const existing: { id: string; event: string }[] = (await monday(token, LIST, { b }))?.webhooks ?? [];
        const row: any = { board: b, account: nameOf.get(b) ?? null, before: existing.map((w) => w.event) };
        if (body.webhooks === "reconcile") {
          const ours = existing.filter((w) => events.includes(w.event));
          for (const w of ours) {
            await monday(token, `mutation ($id: ID!) { delete_webhook(id: $id) { id } }`, { id: w.id });
          }
          for (const event of events) {
            await monday(token,
              `mutation ($b: ID!, $u: String!, $e: WebhookEventType!) { create_webhook(board_id: $b, url: $u, event: $e) { id } }`,
              { b, u: webhookUrl, e: event });
          }
          row.deleted = ours.length;
          row.created = events.length;
          row.after = ((await monday(token, LIST, { b }))?.webhooks ?? []).map((w: any) => w.event);
        }
        report.push(row);
      }
      return Response.json({ ok: true, mode: body.webhooks, target, report });
    }

    const eventBoardId = body?.event?.boardId ? String(body.event.boardId) : null;

    // Debounce webhook bursts: a single board edit often fires several events
    // (status + date + …) within seconds, each triggering a full re-sync. Run
    // by event would race — a sync that read Monday *before* a change committed
    // could finish last and clobber fresh data. So record this event's time,
    // wait briefly, and only proceed if no newer event arrived for this board
    // (the latest event syncs, reading Monday after everything has settled).
    if (eventBoardId) {
      const stamp = new Date().toISOString();
      await supabase.from("monday_sync_debounce").upsert({ board_id: eventBoardId, requested_at: stamp });
      await new Promise((r) => setTimeout(r, 4000));
      const { data: marker } = await supabase
        .from("monday_sync_debounce").select("requested_at").eq("board_id", eventBoardId).maybeSingle();
      if (marker && new Date(marker.requested_at).getTime() > new Date(stamp).getTime()) {
        return Response.json({ ok: true, coalesced: true });
      }
    }

    const { data: accounts, error: accErr } = await supabase
      .from("accounts").select("id, short_name, monday_board_id, monday_service_group_id").not("monday_board_id", "is", null);
    if (accErr) throw accErr;

    // An event from a known account board scopes the sync to that account. An
    // event from an UNKNOWN board (e.g. the sub-items board, where subtask
    // status changes fire) isn't tied to one account, so fall through to a full
    // sync — that's how checking off a subtask updates the stage-progress bars.
    const knownBoards = new Set((accounts ?? []).map((a) => String(a.monday_board_id)));
    const scoped = !!eventBoardId && knownBoards.has(eventBoardId);

    // Order: STALEST BOARD FIRST. The run has a time budget (below); whatever
    // doesn't fit is skipped and, being the least recently stamped, goes first
    // next tick - so every board gets its turn within a few ticks even when
    // Monday is slow, instead of the same tail boards starving every time.
    const { data: stamps } = await supabase.from("monday_sync_status").select("account_id, synced_at");
    const stampedAt = new Map<string, number>((stamps ?? []).map((s: any) => [s.account_id, Date.parse(s.synced_at) || 0]));
    const queue = (accounts ?? [])
      .filter((a) => !scoped || String(a.monday_board_id) === eventBoardId)
      .sort((a, b) => (stampedAt.get(a.id) ?? 0) - (stampedAt.get(b.id) ?? 0));

    const t0 = Date.now();
    const deadline = t0 + RUN_BUDGET_MS;
    const summary: any[] = [];
    const skipped: any[] = [];
    for (const acct of queue) {
      const name = acct.short_name || acct.id;
      if (Date.now() > deadline) {
        skipped.push({ account: acct.id, name, skipped: true, reason: "run budget exhausted; leads the next tick (stalest first)" });
        continue;
      }
      const tAcct = Date.now();
      // One board's failure is recorded and never stops the others.
      try {
        // 1) Read this board's structure and resolve ids by title/type.
        const meta = await monday(token, META_QUERY, { board: [acct.monday_board_id] }, deadline);
        const board = meta?.boards?.[0];
        if (!board) { summary.push({ account: acct.id, name, ok: false, error: "board not found" }); continue; }

        const allGroups: any[] = board.groups ?? [];
        const C = resolveColumns(board.columns ?? []);

        const norm = (s: string) => (s || "").trim().toLowerCase();
        const projectGroupIds = new Set(allGroups.filter((g) => PROJECT_GROUP_TITLES.has(norm(g.title))).map((g) => g.id));
        // "Completed" and "Historical" are both done-archives → forced live.
        const completedGroupIds = new Set(allGroups.filter((g) => isCompletedTitle(g.title) || isHistoricalTitle(g.title)).map((g) => g.id));
        const plannedGroupIds = new Set(allGroups.filter((g) => isPlannedTitle(g.title)).map((g) => g.id));
        // Ongoing group: pinned by ID per account when set (robust to renames),
        // else any group whose title starts with "Ongoing". Items here are real
        // projects (synced into `projects` with status + progress).
        const serviceGroupId = (acct.monday_service_group_id ? String(acct.monday_service_group_id) : null)
          || allGroups.find((g) => /^ongoing\b/.test(norm(g.title)))?.id || null;
        const ticketsGroupId = allGroups.find((g) => norm(g.title) === TICKETS_GROUP_TITLE)?.id ?? "topics";
        // Toolkit group: opt-in systems the client switched on (any group titled "Toolkit").
        const toolkitGroupId = allGroups.find((g) => /^toolkit/.test(norm(g.title)))?.id || null;

        const wantedGroups = [
          ...projectGroupIds, ...completedGroupIds, ...plannedGroupIds, serviceGroupId, ticketsGroupId, toolkitGroupId,
        ].filter(Boolean) as string[];

        // 2) Fetch items for just those groups, requesting the resolved columns.
        // Every group is drained via cursor pagination so a group with >500 items
        // (e.g. a large "Historical" archive) NEVER silently truncates. The old
        // hard 500-cap was a real data-loss trap: once a group grew past 500 the
        // tail just vanished with no error — exactly how past-quarter work went
        // missing. items_page max page size is 500; we follow `cursor` to the end.
        const colIds = [C.status, C.due, C.person, C.category, C.taskId, C.zendesk, C.link, C.workType].filter(Boolean) as string[];
        const ITEM_FIELDS = `
          id
          name
          updated_at
          column_values(ids: ${JSON.stringify(colIds)}) { id text value }
          subitems { id name column_values { text column { type } } }`;
        const ITEMS_QUERY = `
          query ($board: [ID!], $groups: [String!]) {
            boards(ids: $board) {
              groups(ids: $groups) {
                id
                items_page(limit: 500) {
                  cursor
                  items { ${ITEM_FIELDS} }
                }
              }
            }
          }`;
        const NEXT_QUERY = `
          query ($cursor: String!) {
            next_items_page(limit: 500, cursor: $cursor) {
              cursor
              items { ${ITEM_FIELDS} }
            }
          }`;
        // Light id-only queries for the drift count pass (below).
        const IDS_QUERY = `
          query ($board: [ID!], $groups: [String!]) {
            boards(ids: $board) {
              groups(ids: $groups) { id items_page(limit: 500) { cursor items { id } } }
            }
          }`;
        const NEXT_IDS = `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id } } }`;
        const data = await monday(token, ITEMS_QUERY, { board: [acct.monday_board_id], groups: wantedGroups }, deadline);
        const groups: any[] = data?.boards?.[0]?.groups ?? [];
        // Drain each group's remaining pages. guard caps at 100 pages (50k items)
        // per group to make a runaway loop impossible.
        for (const g of groups) {
          if (!g.items_page) continue;
          let cursor: string | null = g.items_page.cursor ?? null;
          let guard = 0;
          while (cursor && guard < 100) {
            const more = await monday(token, NEXT_QUERY, { cursor }, deadline);
            const page = more?.next_items_page;
            if (!page) break;
            g.items_page.items.push(...(page.items ?? []));
            cursor = page.cursor ?? null;
            guard++;
          }
        }

        const projects: any[] = [];
        const actions: any[] = [];
        const toolkit: any[] = []; // { account_id, name } for the "Your toolkit" dashboard row
        const ticketLinks: any[] = []; // { account_id, zendesk_id, link } for the Projects "Open review" button

        for (const g of groups) {
          const items = g.items_page?.items ?? [];
          const isProjectGroup = projectGroupIds.has(g.id);
          const isCompletedGroup = completedGroupIds.has(g.id);
          const isPlannedGroup = plannedGroupIds.has(g.id);
          // "Ongoing" group items are now real projects (status + progress bar),
          // NOT watered-down background services — so sync them as projects.
          const isServiceGroup = !!serviceGroupId && g.id === serviceGroupId;
          const isToolkitGroup = !!toolkitGroupId && g.id === toolkitGroupId;

          items.forEach((it: any) => {
            if (isToolkitGroup) {
              toolkit.push({ account_id: acct.id, monday_item_id: String(it.id), name: it.name, sort: toolkit.length });
              return;
            }
            const cv = cols(it);
            const dueRaw = C.due ? (cv[C.due] || "") : "";
            const upd = it.updated_at ? new Date(it.updated_at) : null;
            const updLabel = upd ? `Updated ${MONTHS[upd.getUTCMonth()]} ${upd.getUTCDate()}` : null;
            const statusText = C.status ? cv[C.status] : "";
            // Origin (Cut A): "Playbook" = planned work; anything else = added/unplanned.
            const origin = norm(C.workType ? (cv[C.workType] || "") : "") === "playbook" ? "planned" : "added";
            const categoryText = C.category ? cv[C.category] : "";
            const owners = (C.person ? (cv[C.person] || "") : "").split(",").map((s) => initials(s)).filter(Boolean);

            if (isProjectGroup || isCompletedGroup || isPlannedGroup || isServiceGroup) {
              let [status, pct] = STATUS_MAP[statusText] ?? ["in-progress", 50];
              if (isCompletedGroup) { status = "live"; pct = 100; }
              else if (isPlannedGroup) { status = "planned"; pct = 0; }
              else { const sp = subtaskPct(it); if (sp !== null) pct = sp; } // stages done ÷ total
              projects.push({
                account_id: acct.id, monday_item_id: String(it.id),
                code: (C.taskId ? cv[C.taskId] : "") || null, title: it.name,
                phase: categoryText || null, engines: [], origin,
                status, pct,
                due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
                owners, pulse: updLabel, subtasks: mapSubtasks(it), sort: projects.length,
              });
            } else if (g.id === ticketsGroupId) {
              // Capture the Monday "Link" (Pastel/review URL) keyed by Zendesk
              // ticket id, for any ticket item that has both — the Projects page
              // surfaces it as "Open review" on the pending/open ticket cards.
              const zdRef = zendeskRef(it, C.zendesk);
              const reviewLink = linkUrl(it, C.link);
              const tPct = subtaskPct(it); // stage progress for the ticket card bar
              if (zdRef.id && (reviewLink || tPct !== null)) {
                ticketLinks.push({ account_id: acct.id, zendesk_id: zdRef.id, link: reviewLink, pct: tPct, label: linkText(it, C.link) });
              }
              if (ACTION_STATUSES.has(statusText)) {
                // Waiting on you (action queue)
                const zd = zendeskRef(it, C.zendesk);
                actions.push({
                  account_id: acct.id, monday_item_id: String(it.id), title: it.name,
                  due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null,
                  zendesk_id: zd.id, zendesk_url: zd.url,
                  sort: actions.length,
                });
              } else if (DONE_TICKET_STATUSES.has(statusText)) {
                // A finished ticket still shows in the completed tasks list.
                projects.push({
                  account_id: acct.id, monday_item_id: String(it.id),
                  code: (C.taskId ? cv[C.taskId] : "") || null, title: it.name,
                  phase: categoryText || null, engines: [], origin,
                  status: "live", pct: 100,
                  due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
                  owners, pulse: updLabel, subtasks: mapSubtasks(it), sort: projects.length,
                });
              }
            }
          });
        }

        // Dedup ticket links by zendesk_id (PK is account_id + zendesk_id).
        const tlSeen = new Set<string>();
        const ticketLinksDedup = ticketLinks.filter((t) => (tlSeen.has(t.zendesk_id) ? false : (tlSeen.add(t.zendesk_id), true)));

        // Drift telemetry for Sync Health. We need the TOP-LEVEL card count, NOT
        // board.items_count — that field includes SUBITEMS (Tidewater: 403 count
        // but only ~30 real cards), which would false-flag subitem-heavy boards.
        // So: items we fetched from synced groups + a light id-only count of every
        // OTHER group. A big "other" bucket = a group we don't recognize (renamed
        // / new) silently not syncing — exactly the RISE-Historical failure mode.
        const wantedSet = new Set(wantedGroups);
        const otherGroupIds = allGroups.map((g) => g.id).filter((id) => !wantedSet.has(id));
        let otherItems = 0;
        if (otherGroupIds.length) {
          const cd = await monday(token, IDS_QUERY, { board: [acct.monday_board_id], groups: otherGroupIds }, deadline);
          for (const g of (cd?.boards?.[0]?.groups ?? [])) {
            let n = (g.items_page?.items ?? []).length;
            let cursor: string | null = g.items_page?.cursor ?? null;
            let guard = 0;
            while (cursor && guard < 100) {
              const more = await monday(token, NEXT_IDS, { cursor }, deadline);
              const page = more?.next_items_page;
              if (!page) break;
              n += (page.items ?? []).length;
              cursor = page.cursor ?? null; guard++;
            }
            otherItems += n;
          }
        }
        const fetchedWanted = groups.reduce((n: number, g: any) => n + (g.items_page?.items?.length || 0), 0);
        const boardTopItems = fetchedWanted + otherItems;

        const syncedRows = projects.length + actions.length + toolkit.length;
        // Rows + stamp land together or not at all (see replaceAccountRows).
        const write = await replaceAccountRows(supabase, acct.id, { projects, actions, ticketLinks: ticketLinksDedup, toolkit }, boardTopItems, syncedRows);

        summary.push({ account: acct.id, name, ok: true, write, board_items: boardTopItems, synced_rows: syncedRows, projects: projects.length, actions: actions.length, toolkit: toolkit.length, ms: Date.now() - tAcct });
      } catch (e) {
        summary.push({ account: acct.id, name, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - tAcct });
      }
    }

    // ok only when every board attempted succeeded. Skipped boards are not
    // failures (they lead the next tick); the watchdog's 2h board check is the
    // backstop if one keeps missing its turn.
    const failed = summary.filter((x) => !x.ok).length;
    return Response.json({
      ok: failed === 0, synced: summary.length - failed, failed, skipped: skipped.length,
      elapsed_ms: Date.now() - t0, summary: [...summary, ...skipped],
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
