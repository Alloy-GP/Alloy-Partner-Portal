import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// sync-monday-roadmap — the Growth Roadmap "Markets" board -> locations.
//
// Each client has its own "Markets" board (accounts.monday_roadmap_board_id):
//   - one ITEM per market/location
//   - a "Stage" status column (Foundation/Traction/Momentum/Expansion/Dominance)
//   - "Role" (text), "Onboarded" (date)
//   - SUBITEMS = that market's CURRENT-stage milestones, each with a "Done"
//     status + optional "Done At" date.
//
// The portal owns every milestone's label/icon/color (by stage+position), so we
// only read which of the 5 positions are done. We AUTO-LABEL the subitems: each
// market's subitems are (re)named to the canonical milestone set for its current
// stage, creating the 5 if missing. Matching is by POSITION, never by name, so a
// rename can never break the read.
//
// Trigger: Monday webhook on the roadmap board (real-time) or a manual call.
// Per-client boards => the board id maps 1:1 to one account (no cross-tenant
// routing risk). verify_jwt: false.
// ============================================================================

const MONDAY_API = "https://api.monday.com/v2";

// Canonical journey — array index IS the stage index used by the portal.
const STAGES = ["Foundation", "Traction", "Momentum", "Expansion", "Dominance"];
function stageIndex(label: string): number {
  const i = STAGES.findIndex((s) => s.toLowerCase() === (label || "").trim().toLowerCase());
  return i < 0 ? 0 : i;
}

// Canonical milestones per stage (must match the portal's STAGE_MILESTONES).
// Position (0..4) is the contract; names are for human readability in Monday.
const MILESTONES: Record<number, string[]> = {
  0: ["Access & credentials secured", "Master brief & sitemap built", "Site live · technical SEO passing", "Tracking live · baseline captured", "GBP optimized · proposal ready"],
  1: ["Target clusters ranking page 1", "GBP in local pack · calls climbing", "Qualified leads flowing & rising", "First Alloy-sourced boards signed", "Reviews building · pipeline fuller"],
  2: ["Broad rankings across clusters", "Flywheel engaging", "Reputation feeding demand", "Boards retained · low churn", "New front chosen & resourced"],
  3: ["Leading visibility across markets", "Expansion tracks producing", "Share of voice ahead of rivals", "Compounding economics visible", "The recognized name in market"],
  4: ["Owned rankings defended", "Share of voice holding/growing", "AI-search presence keeping pace", "Leads & retention steady/growing", "Compounding economics holding"],
};

// A subitem Done status counts as "hit" when its label reads as complete.
const DONE_LABELS = new Set(["done", "complete", "completed", "hit", "achieved", "yes"]);
const isDone = (text: string) => DONE_LABELS.has((text || "").trim().toLowerCase());

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

const norm = (s: string) => (s || "").trim().toLowerCase();
const colByTitle = (cols: any[], title: string, type?: string) =>
  cols.find((c) => norm(c.title) === title && (!type || c.type === type));

// A Monday "link" column stores { url, text } in `value`. Pull the URL.
function linkUrl(c: any): string | null {
  if (!c) return null;
  if (c.value) { try { const v = JSON.parse(c.value); if (v && v.url) return String(v.url); } catch { /* ignore */ } }
  const t = (c.text || "").trim();
  const idx = t.lastIndexOf("http");
  return idx >= 0 ? t.slice(idx).split(/\s/)[0] : null;
}

const META_QUERY = `
  query ($board: [ID!]) {
    boards(ids: $board) {
      columns { id title type settings_str }
    }
  }`;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    // Monday webhook handshake.
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

    // Debounce webhook bursts (shared table with sync-monday; board ids are distinct).
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
      .from("accounts").select("id, monday_roadmap_board_id, monday_program_board_id").not("monday_roadmap_board_id", "is", null);
    if (accErr) throw accErr;

    // A subitem event fires from the subitems board (an unknown board id) — fall
    // through to syncing every roadmap board so a Done toggle still lands. Both
    // the Markets and Program boards count as "known" so their events scope.
    const known = new Set<string>();
    for (const a of accounts ?? []) {
      if (a.monday_roadmap_board_id) known.add(String(a.monday_roadmap_board_id));
      if (a.monday_program_board_id) known.add(String(a.monday_program_board_id));
    }
    const scoped = !!eventBoardId && known.has(eventBoardId);

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      const boardId = String(acct.monday_roadmap_board_id);
      const progBoardId = acct.monday_program_board_id ? String(acct.monday_program_board_id) : null;
      if (scoped && boardId !== eventBoardId && progBoardId !== eventBoardId) continue;

      // 1) Resolve columns on the markets board + the subitems board.
      const meta = await monday(token, META_QUERY, { board: [boardId] });
      const cols: any[] = meta?.boards?.[0]?.columns ?? [];
      if (!cols.length) { summary.push({ account: acct.id, error: "board not found" }); continue; }
      const stageCol = colByTitle(cols, "stage", "status")?.id ?? null;
      const roleCol = colByTitle(cols, "role", "text")?.id ?? null;
      const onbCol = colByTitle(cols, "onboarded", "date")?.id ?? null;
      const subCol = cols.find((c) => c.type === "subtasks");
      let subBoardId: string | null = null;
      try { subBoardId = JSON.parse(subCol?.settings_str || "{}")?.boardIds?.[0]?.toString() ?? null; } catch { /* ignore */ }

      let doneCol: string | null = null, doneAtCol: string | null = null;
      if (subBoardId) {
        const subMeta = await monday(token, META_QUERY, { board: [subBoardId] });
        const subCols: any[] = subMeta?.boards?.[0]?.columns ?? [];
        doneCol = (colByTitle(subCols, "done", "status") || subCols.find((c) => c.type === "status"))?.id ?? null;
        doneAtCol = (colByTitle(subCols, "done at", "date") || subCols.find((c) => c.type === "date"))?.id ?? null;
      }

      // 2) Read markets + their subitems.
      const subColIds = [doneCol, doneAtCol].filter(Boolean) as string[];
      const ITEMS_QUERY = `
        query ($board: [ID!]) {
          boards(ids: $board) {
            items_page(limit: 200) {
              items {
                id name
                column_values(ids: ${JSON.stringify([stageCol, roleCol, onbCol].filter(Boolean))}) { id text value }
                subitems { id name column_values(ids: ${JSON.stringify(subColIds)}) { id text } }
              }
            }
          }
        }`;
      const data = await monday(token, ITEMS_QUERY, { board: [boardId] });
      const items: any[] = data?.boards?.[0]?.items_page?.items ?? [];

      const locations: any[] = [];
      const milestonesByItem: Record<string, any[]> = {};

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const cv: Record<string, string> = {};
        for (const c of it.column_values) cv[c.id] = c.text ?? "";
        const stage = stageIndex(stageCol ? cv[stageCol] : "");
        const canonical = MILESTONES[stage];

        // --- AUTO-LABEL: ensure exactly 5 subitems named the current stage's
        // milestones. Rebuild only when names/count drift (e.g. a stage change or
        // generic placeholders) — steady state never mutates, so staff's Done
        // checks persist. Match by POSITION afterwards.
        let subs: any[] = it.subitems ?? [];
        const namesMatch = subs.length === 5 && canonical.every((lbl, i) => (subs[i]?.name || "").trim() === lbl);
        if (!namesMatch) {
          for (const s of subs) {
            await monday(token, `mutation ($i: ID!) { delete_item(item_id: $i) { id } }`, { i: s.id });
          }
          subs = [];
          for (const lbl of canonical) {
            await monday(token, `mutation ($p: ID!, $n: String!) { create_subitem(parent_item_id: $p, item_name: $n) { id } }`, { p: it.id, n: lbl });
          }
          // Freshly built => all not-done.
        }

        const ms = canonical.map((lbl, i) => {
          const s = namesMatch ? subs[i] : null;
          const scv: Record<string, string> = {};
          if (s) for (const c of s.column_values) scv[c.id] = c.text ?? "";
          const done = s ? isDone(doneCol ? scv[doneCol] : "") : false;
          const doneAtRaw = s && doneAtCol ? scv[doneAtCol] : "";
          return { idx: i, label: lbl, done, done_at: done && doneAtRaw ? `${doneAtRaw}T00:00:00Z` : null };
        });

        locations.push({
          account_id: acct.id, monday_item_id: String(it.id), name: it.name,
          role: roleCol ? (cv[roleCol] || null) : null,
          onboarded: onbCol ? (cv[onbCol] || null) : null,
          stage, sort: idx,
        });
        milestonesByItem[String(it.id)] = ms;
      }

      // 3) Mirror into the read tables (delete-then-insert per account).
      await supabase.from("locations").delete().eq("account_id", acct.id);
      if (locations.length) {
        const { data: inserted, error: insErr } = await supabase.from("locations").insert(locations).select("id, monday_item_id");
        if (insErr) throw insErr;
        const rows: any[] = [];
        for (const loc of inserted ?? []) {
          for (const m of milestonesByItem[loc.monday_item_id] || []) {
            rows.push({ location_id: loc.id, idx: m.idx, label: m.label, done: m.done, done_at: m.done_at });
          }
        }
        if (rows.length) {
          const { error: msErr } = await supabase.from("location_milestones").insert(rows);
          if (msErr) throw msErr;
        }
      }

      // 4) Program quarters (engine card): one item per calendar quarter, with a
      // Proof (X->Y) line + Playbook/Report deliverable links. Initiatives are
      // reused from projects on the portal side (grouped by quarter via due-date).
      let quarters = 0;
      if (progBoardId) {
        const pmeta = await monday(token, META_QUERY, { board: [progBoardId] });
        const pcols: any[] = pmeta?.boards?.[0]?.columns ?? [];
        const qCol = colByTitle(pcols, "quarter", "date")?.id ?? null;
        const proofCol = (colByTitle(pcols, "proof", "long_text") || colByTitle(pcols, "proof", "text"))?.id ?? null;
        const pbCol = colByTitle(pcols, "playbook", "link")?.id ?? null;
        const rpCol = colByTitle(pcols, "report", "link")?.id ?? null;
        const pColIds = [qCol, proofCol, pbCol, rpCol].filter(Boolean) as string[];
        const PQ = `query ($board: [ID!]) { boards(ids: $board) { items_page(limit: 200) { items { id name column_values(ids: ${JSON.stringify(pColIds)}) { id text value } } } } }`;
        const pdata = await monday(token, PQ, { board: [progBoardId] });
        const pitems: any[] = pdata?.boards?.[0]?.items_page?.items ?? [];
        const rows = pitems.map((it) => {
          const cv: Record<string, any> = {};
          for (const c of it.column_values) cv[c.id] = c;
          return {
            account_id: acct.id, monday_item_id: String(it.id), label: it.name,
            quarter_start: qCol && cv[qCol]?.text ? cv[qCol].text : null,
            proof: proofCol ? (cv[proofCol]?.text || null) : null,
            playbook_url: pbCol ? linkUrl(cv[pbCol]) : null,
            report_url: rpCol ? linkUrl(cv[rpCol]) : null,
          };
        }).sort((a, b) => String(a.quarter_start || "").localeCompare(String(b.quarter_start || "")));
        rows.forEach((r, i) => { (r as any).sort = i; });
        await supabase.from("program_quarters").delete().eq("account_id", acct.id);
        if (rows.length) {
          const { error: pqErr } = await supabase.from("program_quarters").insert(rows);
          if (pqErr) throw pqErr;
        }
        quarters = rows.length;
      }

      summary.push({ account: acct.id, markets: locations.length, quarters });
    }

    return Response.json({ ok: true, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
