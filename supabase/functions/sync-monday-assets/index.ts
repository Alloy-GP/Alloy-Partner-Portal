import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// sync-monday-assets — a client's "Assets" board -> public.assets.
//
// Each client has its own Assets board (accounts.monday_assets_board_id):
//   - one ITEM per finished deliverable (the asset name = item name)
//   - GROUPS are the category sections (e.g. "Logos & Brand", "Email",
//     "Print & Direct Mail", "Social", "Sales & Proposals", "Events").
//   - columns (matched by title, all optional):
//       "Note"    (text/long-text)  -> short description under the name
//       "Format"  (text/dropdown)   -> comma/space list e.g. "SVG, PNG, EPS";
//                                      first token is the chip on the thumb
//       "Spec"    (text)            -> dimension/variant e.g. "Vector", "6×9 in"
//       "Updated" (date)            -> shown as "Mon YYYY"
//       "Link"    (link)            -> download URL fallback
//   - any FILES attached to the item become the file count; the first file is
//     the download URL, the first image file becomes the thumbnail.
//
// Per-client boards => board id maps 1:1 to one account (no cross-tenant
// routing risk). Trigger: Monday webhook on the assets board, or a manual call.
// verify_jwt: false.
// ============================================================================

const MONDAY_API = "https://api.monday.com/v2";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i;

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
const colByTitle = (cols: any[], title: string) => cols.find((c) => norm(c.title) === title);

function linkUrl(c: any): string | null {
  if (!c) return null;
  if (c.value) { try { const v = JSON.parse(c.value); if (v && v.url) return String(v.url); } catch { /* ignore */ } }
  const t = (c.text || "").trim();
  const idx = t.lastIndexOf("http");
  return idx >= 0 ? t.slice(idx).split(/\s/)[0] : null;
}

// "2026-03-14" -> "Mar 2026"
function monthLabel(text: string): string | null {
  const m = /(\d{4})-(\d{2})/.exec(text || "");
  if (!m) return null;
  const mi = Number(m[2]) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${m[1]}` : null;
}

function formatList(text: string): string[] {
  return (text || "").split(/[,/·]|\s{2,}/).map((s) => s.trim()).filter(Boolean);
}

const META_QUERY = `
  query ($board: [ID!]) {
    boards(ids: $board) { columns { id title type } }
  }`;

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

    // Debounce webhook bursts (shared table; board ids are distinct).
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
      .from("accounts").select("id, monday_assets_board_id").not("monday_assets_board_id", "is", null);
    if (accErr) throw accErr;

    const known = new Set<string>((accounts ?? []).map((a) => String(a.monday_assets_board_id)));
    const scoped = !!eventBoardId && known.has(eventBoardId);

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      const boardId = String(acct.monday_assets_board_id);
      if (scoped && boardId !== eventBoardId) continue;

      // 1) Resolve columns.
      const meta = await monday(token, META_QUERY, { board: [boardId] });
      const cols: any[] = meta?.boards?.[0]?.columns ?? [];
      if (!cols.length) { summary.push({ account: acct.id, error: "board not found" }); continue; }
      const noteCol = colByTitle(cols, "note")?.id ?? null;
      const fmtCol = colByTitle(cols, "format")?.id ?? null;
      const specCol = colByTitle(cols, "spec")?.id ?? null;
      const updCol = (colByTitle(cols, "updated") || cols.find((c) => c.type === "date"))?.id ?? null;
      const linkCol = (colByTitle(cols, "link") || cols.find((c) => c.type === "link"))?.id ?? null;
      const wantCols = [noteCol, fmtCol, specCol, updCol, linkCol].filter(Boolean) as string[];

      // 2) Read items (with their group + attached files).
      const ITEMS_QUERY = `
        query ($board: [ID!]) {
          boards(ids: $board) {
            items_page(limit: 300) {
              items {
                id name
                group { id title }
                column_values(ids: ${JSON.stringify(wantCols)}) { id text value }
                assets { public_url name }
              }
            }
          }
        }`;
      const data = await monday(token, ITEMS_QUERY, { board: [boardId] });
      const items: any[] = data?.boards?.[0]?.items_page?.items ?? [];

      const rows = items.map((it, idx) => {
        const cv: Record<string, any> = {};
        for (const c of it.column_values) cv[c.id] = c;
        const formats = fmtCol ? formatList(cv[fmtCol]?.text || "") : [];
        const assets: any[] = it.assets ?? [];
        const firstImg = assets.find((a) => IMG_RE.test(a.public_url || a.name || ""));
        return {
          account_id: acct.id,
          monday_item_id: String(it.id),
          name: it.name || "Untitled",
          note: noteCol ? (cv[noteCol]?.text || null) : null,
          category: it.group?.title || "Other",
          format: formats[0] || null,
          formats: formats.length ? formats : null,
          spec: specCol ? (cv[specCol]?.text || null) : null,
          file_count: assets.length || null,
          updated_label: updCol ? monthLabel(cv[updCol]?.text || "") : null,
          thumb_url: firstImg?.public_url || null,
          download_url: assets[0]?.public_url || (linkCol ? linkUrl(cv[linkCol]) : null),
          sort: idx,
        };
      });

      // 3) Upsert + prune anything no longer on the board.
      if (rows.length) {
        const { error: upErr } = await supabase
          .from("assets").upsert(rows, { onConflict: "account_id,monday_item_id" });
        if (upErr) { summary.push({ account: acct.id, error: upErr.message }); continue; }
      }
      const keepIds = rows.map((r) => r.monday_item_id);
      let del = supabase.from("assets").delete().eq("account_id", acct.id).not("monday_item_id", "is", null);
      if (keepIds.length) del = del.not("monday_item_id", "in", `(${keepIds.join(",")})`);
      await del;

      summary.push({ account: acct.id, board: boardId, assets: rows.length });
    }

    return Response.json({ ok: true, summary });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
