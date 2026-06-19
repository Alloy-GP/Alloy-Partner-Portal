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

const MONDAY_API = "https://api.monday.com/v2";

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

async function monday(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": token, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("Monday API error: " + JSON.stringify(json.errors));
  return json.data;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    if (body && body.challenge) return Response.json({ challenge: body.challenge });

    const expected = Deno.env.get("SYNC_SECRET");
    if (expected && url.searchParams.get("secret") !== expected) {
      return new Response("unauthorized", { status: 401 });
    }

    const token = (Deno.env.get("MONDAY_API_TOKEN") || "").trim();
    if (!token) return new Response("MONDAY_API_TOKEN not set", { status: 500 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
      .from("accounts").select("id, monday_board_id, monday_service_group_id").not("monday_board_id", "is", null);
    if (accErr) throw accErr;

    // An event from a known account board scopes the sync to that account. An
    // event from an UNKNOWN board (e.g. the sub-items board, where subtask
    // status changes fire) isn't tied to one account, so fall through to a full
    // sync — that's how checking off a subtask updates the stage-progress bars.
    const knownBoards = new Set((accounts ?? []).map((a) => String(a.monday_board_id)));
    const scoped = !!eventBoardId && knownBoards.has(eventBoardId);

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (scoped && acct.monday_board_id !== eventBoardId) continue;

      // 1) Read this board's structure and resolve ids by title/type.
      const meta = await monday(token, META_QUERY, { board: [acct.monday_board_id] });
      const board = meta?.boards?.[0];
      if (!board) { summary.push({ account: acct.id, error: "board not found" }); continue; }

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
      const data = await monday(token, ITEMS_QUERY, { board: [acct.monday_board_id], groups: wantedGroups });
      const groups: any[] = data?.boards?.[0]?.groups ?? [];
      // Drain each group's remaining pages. guard caps at 100 pages (50k items)
      // per group to make a runaway loop impossible.
      for (const g of groups) {
        if (!g.items_page) continue;
        let cursor: string | null = g.items_page.cursor ?? null;
        let guard = 0;
        while (cursor && guard < 100) {
          const more = await monday(token, NEXT_QUERY, { cursor });
          const page = more?.next_items_page;
          if (!page) break;
          g.items_page.items.push(...(page.items ?? []));
          cursor = page.cursor ?? null;
          guard++;
        }
      }

      const projects: any[] = [];
      const services: any[] = []; // kept empty: "Ongoing" items now sync as projects (clears stale recurring_services)
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
              ticketLinks.push({ account_id: acct.id, zendesk_id: zdRef.id, link: reviewLink, pct: tPct });
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

      // Each table mirrors Monday for this account: clear then insert.
      for (const [table, rows] of [["projects", projects], ["recurring_services", services], ["action_items", actions], ["ticket_links", ticketLinksDedup], ["toolkit_systems", toolkit]] as const) {
        const { error: delErr } = await supabase.from(table).delete().eq("account_id", acct.id);
        if (delErr) throw delErr;
        if (rows.length) {
          const { error: insErr } = await supabase.from(table).insert(rows);
          if (insErr) throw insErr;
        }
      }

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
        const cd = await monday(token, IDS_QUERY, { board: [acct.monday_board_id], groups: otherGroupIds });
        for (const g of (cd?.boards?.[0]?.groups ?? [])) {
          let n = (g.items_page?.items ?? []).length;
          let cursor: string | null = g.items_page?.cursor ?? null;
          let guard = 0;
          while (cursor && guard < 100) {
            const more = await monday(token, NEXT_IDS, { cursor });
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
      await supabase.from("monday_sync_status").upsert({
        account_id: acct.id,
        board_items: boardTopItems,
        synced_rows: syncedRows,
        synced_at: new Date().toISOString(),
      });

      summary.push({ account: acct.id, board_items: boardTopItems, synced_rows: syncedRows, projects: projects.length, actions: actions.length, toolkit: toolkit.length });
    }

    return Response.json({ ok: true, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
