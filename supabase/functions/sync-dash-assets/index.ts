import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// sync-dash-assets — Dash DAM (alloy.dash.app) -> public.assets.
//
// REAL API host: https://api-v2.dash.app (the unprefixed edge; gateway rewrites
// to /platform-*/v2/*). Auth: Bearer access token, refreshed from the stored
// refresh token in public.dash_oauth (Dash has no client-credentials grant).
//
// Model: brand = a top-level option of the "Folders" field; accounts.dash_folder_id
// holds that option's id. Its DIRECT children whose name matches a canonical category
// (Logos & Brand / Email / …) are the portal sections — other children (Uploads, RISE
// Office, …) are ignored. One Dash asset = one card.
//
// The server-side folder-filter criterion shape is still unconfirmed, so we pull all
// assets (match-all, paged) and group by each asset's folder value in code — PROVEN to
// work. Thumbnail + download use the asset file's previewUrl (signed CDN URL; refreshed
// each sync). TODO: swap to stable embeddable links (POST /embeddable-link-batch-jobs).
//
// Trigger: cron or manual POST. verify_jwt: false (guard with ?secret=).
// ============================================================================

const API = "https://api-v2.dash.app";
const TOKEN_URL = "https://login.dash.app/oauth/token";
const MATCH_ALL = { type: "AND", criteria: [] as unknown[] };

// Canonical portal categories (must match the Dash subfolder names exactly).
const CATEGORY_ORDER = ["Logos & Brand", "Email", "Print & Direct Mail", "Social", "Sales & Proposals", "Events"];

async function getAccessToken(supabase: any): Promise<string> {
  const { data: row, error } = await supabase.from("dash_oauth").select("*").eq("id", "dash").maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("dash_oauth not connected — run the one-time authorize first");
  if (row.access_token && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime() - 60_000 > Date.now()) {
    return row.access_token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: (Deno.env.get("DASH_CLIENT_ID") || "").trim(),
      client_secret: (Deno.env.get("DASH_CLIENT_SECRET") || "").trim(),
    }).toString(),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error("token refresh failed: " + JSON.stringify(tok));
  await supabase.from("dash_oauth").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || row.refresh_token,
    access_token_expires_at: tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", "dash");
  return tok.access_token;
}

async function dash(token: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method: body == null ? "GET" : "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dash ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Page through a *-searches endpoint (match-all) collecting every result.result.
// Dedupe by id — match-all paging has no stable sort, so windows can overlap as the
// dataset shifts; dedup gives the correct unique set and avoids dup conflict keys.
async function searchAll(token: string, path: string, criterion: unknown): Promise<any[]> {
  const byId = new Map<string, any>();
  for (let page = 0; page < 40; page++) {
    const data = await dash(token, path, { from: page * 200, pageSize: 200, criterion, sorts: [] });
    const res: any[] = data?.results ?? [];
    for (const r of res) { const x = r.result ?? r; byId.set(String(x.id), x); }
    if (res.length < 200) break;
  }
  return [...byId.values()];
}

const extOf = (fn: string) => (fn && fn.includes(".") ? fn.split(".").pop()!.toUpperCase() : "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    let reqBody: any = {};
    try { reqBody = await req.json(); } catch { /* empty */ }
    if (reqBody && reqBody.challenge) return Response.json({ challenge: reqBody.challenge }, { headers: CORS });
    const expected = Deno.env.get("SYNC_SECRET");
    if (expected && url.searchParams.get("secret") !== expected) return new Response("unauthorized", { status: 401 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = await getAccessToken(supabase);

    // Resolve field ids by role (account-agnostic): Title = single-line text, Folders = picker.
    const fields: any[] = (await dash(token, "/fields"))?.map?.((f: any) => f.result ?? f)
      ?? (await dash(token, "/fields"))?.results?.map((f: any) => f.result) ?? [];
    const flist = Array.isArray(fields) ? fields : [];
    const titleField = flist.find((f) => f.name === "Title") || flist.find((f) => f?.editControl?.id === "SINGLE_LINE_TEXT");
    const folderField = flist.find((f) => f?.editControl?.id === "FOLDER_PICKER") || flist.find((f) => f.name === "Folders");
    if (!folderField) throw new Error("no FOLDER_PICKER field found");
    const TITLE_ID = titleField?.id;
    const FOLDER_ID = folderField.id;

    // Folder tree: id -> { name, parentId }.
    const opts = await searchAll(token, "/field-option-searches", { type: "FIELD_EQUALS", field: "FIELD_ID", value: FOLDER_ID });
    const fName = new Map<string, string>();
    const fParent = new Map<string, string | null>();
    for (const o of opts) {
      fName.set(o.id, o.value);
      fParent.set(o.id, (o.parent?.result ?? o.parent)?.id ?? null);
    }

    const { data: accounts, error: accErr } = await supabase
      .from("accounts").select("id, dash_folder_id").not("dash_folder_id", "is", null);
    if (accErr) throw accErr;

    // Pull all assets once (shared across accounts).
    const assets = await searchAll(token, "/asset-searches", MATCH_ALL);

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      try {
        // dash_folder_id may be the folder option id OR the brand folder NAME (easier to
        // grab from Dash). Resolve a name to its top-level folder option id.
        let brand = String(acct.dash_folder_id).trim();
        if (!fName.has(brand)) {
          const m = [...fName.entries()].find(([id, name]) => !fParent.get(id) && String(name || "").toLowerCase() === brand.toLowerCase());
          if (m) brand = m[0];
        }
        // category folder id -> name, for this brand's direct children matching the canon.
        const catName = new Map<string, string>();
        for (const [id, parent] of fParent) {
          if (parent === brand && CATEGORY_ORDER.includes(fName.get(id) || "")) catName.set(id, fName.get(id)!);
        }

        const rows: any[] = [];
        const usedAssetIds = new Set<string>();
        let sort = 0;
        // Stable category order, then assets within. An asset lands in one category only.
        const orderedCats = [...catName.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[1]) - CATEGORY_ORDER.indexOf(b[1]));
        for (const [catId, catLabel] of orderedCats) {
          for (const a of assets) {
            if (usedAssetIds.has(String(a.id))) continue;
            const vals = a?.metadata?.values ?? {};
            const folders: string[] = vals[FOLDER_ID] ?? [];
            if (!folders.includes(catId)) continue;
            if (a?.lifecycleStatus?.state && a.lifecycleStatus.state !== "LIVE") continue;
            const caf = a.currentAssetFile ?? {};
            const fmt = extOf(caf.filename || "");
            const title = (TITLE_ID && vals[TITLE_ID]?.[0]) || (caf.filename || "").replace(/\.[^.]+$/, "") || "Untitled";
            rows.push({
              account_id: acct.id,
              dash_asset_id: String(a.id),
              name: title,
              note: null,
              category: catLabel,
              format: fmt || null,
              formats: fmt ? [fmt] : null,
              spec: caf.dimensions ? `${caf.dimensions.width}×${caf.dimensions.height}` : null,
              file_count: 1,
              updated_label: null,
              thumb_url: caf.previewUrl || null,
              download_url: caf.previewUrl || "#",
              sort: sort++,
            });
            usedAssetIds.add(String(a.id));
          }
        }

        if (rows.length) {
          const { error: upErr } = await supabase.from("assets").upsert(rows, { onConflict: "account_id,dash_asset_id" });
          if (upErr) throw upErr;
        }
        const keep = rows.map((r) => r.dash_asset_id);
        let del = supabase.from("assets").delete().eq("account_id", acct.id).not("dash_asset_id", "is", null);
        if (keep.length) del = del.not("dash_asset_id", "in", `(${keep.join(",")})`);
        await del;

        summary.push({ account: acct.id, categories: catName.size, assets: rows.length });
      } catch (e: any) {
        summary.push({ account: acct.id, error: e?.message || e?.msg || JSON.stringify(e) });
      }
    }

    return Response.json({ ok: true, scannedAssets: assets.length, summary }, { headers: CORS });
  } catch (e: any) {
    return new Response(String((e && e.message) || e), { status: 500, headers: CORS });
  }
});
