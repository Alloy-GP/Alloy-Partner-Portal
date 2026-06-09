import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs a Monday "<Client> Q2" board into the portal's read tables:
//   Active Projects + Strategy & Reporting + Completed (Jun/May) -> projects
//   Ongoing Services                                             -> recurring_services
//   Tickets group, Monday Status in ACTION_STATUSES              -> action_items
// Trigger: Monday webhook (real-time) on board change, or a manual call.

const MONDAY_API = "https://api.monday.com/v2";

const PROJECT_GROUPS = ["group_title", "group_mm3qxr1j", "group_mm40m2a1", "group_mm3sekqf"];
const COMPLETED_GROUPS = new Set(["group_mm40m2a1", "group_mm3sekqf"]);
const SERVICE_GROUP = "group_mm3q3dg1";
const TICKETS_GROUP = "topics";
// Monday Status (source of truth, set by the Zendesk->Monday automation) that
// surfaces a ticket in the action queue. Adjust to taste.
const ACTION_STATUSES = new Set(["Review"]);
const ALL_GROUPS = [...PROJECT_GROUPS, SERVICE_GROUP, TICKETS_GROUP];

const COL_STATUS = "status";
const COL_DUE = "18414964193__date_mm3xzf45";
const COL_PERSON = "person";
const COL_CATEGORY = "color_mm3qzt0h";
const COL_TASKID = "18414964193__text_mm3xd56m";

// Project status map. "review" is intentionally NOT a project status — review
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

const QUERY = `
  query ($board: [ID!], $groups: [String!]) {
    boards(ids: $board) {
      groups(ids: $groups) {
        id
        items_page(limit: 200) {
          items {
            id
            name
            updated_at
            column_values(ids: ["${COL_STATUS}","${COL_DUE}","${COL_PERSON}","${COL_CATEGORY}","${COL_TASKID}"]) {
              id
              text
            }
          }
        }
      }
    }
  }`;

async function mondayQuery(token: string, variables: Record<string, unknown>) {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": token, "API-Version": "2024-10" },
    body: JSON.stringify({ query: QUERY, variables }),
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

      const data = await mondayQuery(token, { board: [acct.monday_board_id], groups: ALL_GROUPS });
      const groups: any[] = data?.boards?.[0]?.groups ?? [];

      const projects: any[] = [];
      const services: any[] = [];
      const actions: any[] = [];

      for (const g of groups) {
        const items = g.items_page?.items ?? [];
        items.forEach((it: any, idx: number) => {
          const cv = cols(it);
          const dueRaw = cv[COL_DUE] || "";
          const upd = it.updated_at ? new Date(it.updated_at) : null;
          const updLabel = upd ? `Updated ${MONTHS[upd.getUTCMonth()]} ${upd.getUTCDate()}` : null;

          if (PROJECT_GROUPS.includes(g.id)) {
            let [status, pct] = STATUS_MAP[cv[COL_STATUS]] ?? ["in-progress", 50];
            if (COMPLETED_GROUPS.has(g.id)) { status = "live"; pct = 100; }
            projects.push({
              account_id: acct.id, monday_item_id: String(it.id),
              code: cv[COL_TASKID] || null, title: it.name,
              phase: cv[COL_CATEGORY] || null, engines: [],
              status, pct,
              due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
              owners: (cv[COL_PERSON] || "").split(",").map((s) => initials(s)).filter(Boolean),
              pulse: updLabel, sort: projects.length,
            });
          } else if (g.id === SERVICE_GROUP) {
            const cat = cv[COL_CATEGORY] || "";
            services.push({
              account_id: acct.id, monday_item_id: String(it.id), name: it.name,
              short: (cat || it.name).slice(0, 3).toUpperCase(), cadence: "Ongoing",
              lane: cat || null, color: TONE_BY_CAT[cat] || "purple",
              last_touch: updLabel, note: cat || null, sort: services.length,
            });
          } else if (g.id === TICKETS_GROUP) {
            const st = cv[COL_STATUS];
            if (ACTION_STATUSES.has(st)) {
              // Waiting on you (action queue)
              actions.push({
                account_id: acct.id, monday_item_id: String(it.id), title: it.name,
                due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null,
                sort: actions.length,
              });
            } else if (st === "Completed") {
              // A finished ticket still shows in the completed tasks list.
              projects.push({
                account_id: acct.id, monday_item_id: String(it.id),
                code: cv[COL_TASKID] || null, title: it.name,
                phase: cv[COL_CATEGORY] || null, engines: [],
                status: "live", pct: 100,
                due_date: dueRaw || null, due_label: dueRaw ? fmtDate(dueRaw) : null, due_rel: null,
                owners: (cv[COL_PERSON] || "").split(",").map((s) => initials(s)).filter(Boolean),
                pulse: updLabel, sort: projects.length,
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
