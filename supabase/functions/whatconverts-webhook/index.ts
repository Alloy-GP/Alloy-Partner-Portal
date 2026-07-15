import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// whatconverts-webhook — WhatConverts calls this the moment a lead is created,
// so leads land in the portal in seconds instead of waiting for the 30-min cron
// backstop. Configure the webhook URL per WhatConverts account as:
//   .../whatconverts-webhook?account=<portal account id>
// (same URL for every WC account that belongs to one portal client). On hit it
// kicks a SCOPED sync-whatconverts for that account (upsert-and-prune), which
// pulls the new lead and refreshes any edits — no full rebuild, no empty window.
//
// verify_jwt: false so WhatConverts can POST without Supabase auth headers. The
// ?account= id only triggers an idempotent resync (no data is returned/exposed),
// so it's safe to leave open; can be hardened with a token later.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  // account can come from the query (?account=) or a JSON body {account|accountId}.
  let account = (url.searchParams.get("account") || url.searchParams.get("accountId") || "").trim();
  if (!account) {
    try { const b = await req.json(); account = String(b?.account || b?.accountId || "").trim(); } catch { /* no body */ }
  }
  if (!isUuid(account)) {
    return json({ ok: false, error: "append ?account=<portal account id> to the webhook URL" }, 400);
  }

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${base}/functions/v1/sync-whatconverts`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: account }),
  });
  const out = await res.json().catch(() => ({}));
  return json({ ok: res.ok, account, synced: out?.summary?.[0]?.leads ?? null });
});
