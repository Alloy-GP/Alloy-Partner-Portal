import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs a Monday "<Client> Q2" board into the portal's read tables:
//   Active Projects + Strategy & Reporting + Completed* -> projects
//   Ongoing Services                                    -> recurring_services
//   Tickets group, Monday Status in ACTION_STATUSES     -> action_items
// Trigger: Monday webhook (real-time) on board change, or a manual call.
//
// Every client board is built from the same TEMPLATE — same group titles and
// column titles/types — but Monday generates fresh ids per board. So we never
// hardcode ids: we read the board's metadata and resolve groups by title and
// columns by title+type. This works for any client board following the layout.

const MONDAY_API = "https://api.monday.com/v2";

// Group titles (matched case-insensitively, trimmed).
const PROJECT_GROUP_TITLES = new Set(["active projects", "strategy & reporting"]);
const SERVICE_GROUP_TITLE = "ongoing services";
const TICKETS_GROUP_TITLE = "tickets";
const isCompletedTitle = (t: string) => /^completed\b/i.test((t || "").trim());

// Monday Status (source of truth, set by the Zendesk->Monday automation) that
// surfaces a ticket in the action queue.
const ACTION_STATUSES = new Set(["Review"]);
// Status labels that mean a ticket is finished (shown in completed work).
const DONE_TICKET_STATUSES = new Set(["Completed", "Complete", "Solved", "solved"]);

const ZENDESK_BASE = "https://alloycreatives.zendesk.com";

// Project status map. "Review" is intentionally NOT a project status — review
// is a ticket concept (the action queue). Waiting/Review projects show as
// in-progress here.
const STATUS_MAP: Record<string, [string, number]> = {
  "Planning": ["planning", 10],
  "Not Started": ["planning", 5],
  "Assigned": ["assigned", 30],
  "In-Progress": ["in-progress", 60],
  "Waiting": ["in-progress", 60],
  "Review": ["in-progress", 60],
  "Reprioritized / Hold": ["planning", 20],
  "Completed": ["live", 100],
  "Complete": ["live", 100],
};

// Monday "Category" -> one of the portal's 5 recurring-service tones.
const TONE_BY_CAT: Record<string, string> = {
  "Social Media": "blue", "SEO & Technical": "purple", "Local & GBP": "green",
  "Content & Copy": "yellow", "Paid Media": "pink", "Email & Newsletter": "green",
  "Video Production": "pink", "Web Development": "blue", "Design & Assets": "yellow",
  "Sales Enablement": "purple", "Client Retention": "pink", "Education & Training": "purple",
  "Operations": "purple", "Strategy & Reporting": "purple", "Foundation & Onboarding": "blue",
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
  category: string | null; taskId: string | null; zendesk: string | null;
};

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

    const { data: accounts, error: accErr } = await supabase
      .from("accounts").select("id, monday_board_id").not("monday_board_id", "is", null);
    if (accErr) throw accErr;

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (eventBoardId && acct.monday_board_id !== eventBoardId) continue;

      // 1) Read this board's structure and resolve ids by title/type.
      const meta = await monday(token, META_QUERY, { board: [acct.monday_board_id] });
      const board = meta?.boards?.[0];
      if (!board) { summary.push({ account: acct.id, error: "board not found" }); continue; }

      const allGroups: any[] = board.groups ?? [];
      const C = resolveColumns(board.columns ?? []);

      const norm = (s: string) => (s || "").trim().toLowerCase();
      const projectGroupIds = new Set(allGroups.filter((g) => PROJECT_GROUP_TITLES.has(norm(g.title))).map((g) => g.id));
      const completedGroupIds = new Set(allGroups.filter((g) => isCompletedTitle(g.title)).map((g) => g.id));
      const serviceGroupId = allGroups.find((g) => norm(g.title) === SERVICE_GROUP_TITLE)?.id ?? null;
      const ticketsGroupId = allGroups.find((g) => norm(g.title) === TICKETS_GROUP_TITLE)?.id ?? "topics";

      const wantedGroups = [
        ...projectGroupIds, ...completedGroupIds, serviceGroupId, ticketsGroupId,
      ].filter(Boolean) as string[];

      // 2) Fetch items for just those groups, requesting the resolved columns.
      const colIds = [C.status, C.due, C.person, C.category, C.taskId, C.zendesk].filter(Boolean) as string[];
      const ITEMS_QUERY = `
        query ($board: [ID!], $groups: [String!]) {
          boards(ids: $board) {
            groups(ids: $groups) {
              id
              items_page(limit: 200) {
                items {
                  id
                  name
                  updated_at
                  column_values(ids: ${JSON.stringify(colIds)}) { id text value }
                }
              }
            }
          }
        }`;
      const data = await monday(token, ITEMS_QUERY, { board: [acct.monday_board_id], groups: wantedGroups });
      const groups: any[] = data?.boards?.[0]?.groups ?? [];

      const projects: any[] = [];
      const services: any[] = [];
      const actions: any[] = [];

      for (const g of groups) {
        const items = g.items_page?.items ?? [];
        const isProjectGroup = projectGroupIds.has(g.id);
        const isCompletedGroup = completedGroupIds.has(g.id);

        items.forEach((it: any) => {
          const cv = cols(it);
          const dueRaw = C.due ? (cv[C.due] || "") : "";
          const upd = it.updated_at ? new Date(it.updated_at) : null;
          const updLabel = upd ? `Updated ${MONTHS[upd.getUTCMonth()]} ${upd.getUTCDate()}` : null;
          const statusText = C.status ? cv[C.status] : "";
          const categoryText = C.category ? cv[C.category] : "";
          const owners = (C.person ? (cv[C.person] || "") : "").split(",").map((s) => initials(s)).filter(Boolean);

          if (isProjectGroup || isCompletedGroup) {
            let [status, pct] = STATUS_MAP[statusText] ?? ["in-progress", 50];
            if (isCompletedGroup) { status = "live"; pct = 100; }
            projects.push({
              account_id: acct.id, monday_item_id: String(it.id),
              code: (C.taskId ? cv[C.taskId] : "") || null, title: it.name,
              phase: categoryText || null, engines: [],
              status, pct,
              due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
              owners, pulse: updLabel, sort: projects.length,
            });
          } else if (g.id === serviceGroupId) {
            const cat = categoryText;
            services.push({
              account_id: acct.id, monday_item_id: String(it.id), name: it.name,
              short: (cat || it.name).slice(0, 3).toUpperCase(), cadence: "Ongoing",
              lane: cat || null, color: TONE_BY_CAT[cat] || "purple",
              last_touch: updLabel, note: cat || null, sort: services.length,
            });
          } else if (g.id === ticketsGroupId) {
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
                phase: categoryText || null, engines: [],
                status: "live", pct: 100,
                due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
                owners, pulse: updLabel, sort: projects.length,
              });
            }
          }
        });
      }

      // Each table mirrors Monday for this account: clear then insert.
      for (const [table, rows] of [["projects", projects], ["recurring_services", services], ["action_items", actions]] as const) {
        const { error: delErr } = await supabase.from(table).delete().eq("account_id", acct.id);
        if (delErr) throw delErr;
        if (rows.length) {
          const { error: insErr } = await supabase.from(table).insert(rows);
          if (insErr) throw insErr;
        }
      }

      summary.push({ account: acct.id, projects: projects.length, services: services.length, actions: actions.length });
    }

    return Response.json({ ok: true, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
