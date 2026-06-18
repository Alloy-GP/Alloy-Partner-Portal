import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// One-off / admin: clear `sales_value` to 0 in WhatConverts (the SOURCE OF
// TRUTH) for every lead on an account. Direct DB edits get restored by the
// next mirror, so the only durable way to remove sales values is to clear them
// at WhatConverts — then sync-whatconverts pulls 0 (→ null) on its next run.
// Body: { accountId }. verify_jwt: false (gated by SYNC_SECRET when set).

const WC_BASE = "https://app.whatconverts.com/api/v1";
function wcAuth(): string {
  const token = (Deno.env.get("WHATCONVERTS_TOKEN") || "").trim();
  const secret = (Deno.env.get("WHATCONVERTS_SECRET") || "").trim();
  return "Basic " + btoa(`${token}:${secret}`);
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const expected = Deno.env.get("SYNC_SECRET");
    if (expected && url.searchParams.get("secret") !== expected) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!Deno.env.get("WHATCONVERTS_TOKEN") || !Deno.env.get("WHATCONVERTS_SECRET")) {
      return new Response(JSON.stringify({ ok: false, error: "WhatConverts not configured" }), { status: 500 });
    }
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return new Response(JSON.stringify({ ok: false, error: "missing accountId" }), { status: 400 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: leads, error } = await supabase
      .from("leads").select("wc_lead_id, sales_value")
      .eq("account_id", accountId)
      .not("wc_lead_id", "is", null)
      .not("sales_value", "is", null)
      .neq("sales_value", 0);
    if (error) throw error;

    let cleared = 0;
    const errs: any[] = [];
    for (const l of leads ?? []) {
      const form = new URLSearchParams();
      form.set("sales_value", "0");
      const res = await fetch(`${WC_BASE}/leads/${encodeURIComponent(l.wc_lead_id)}`, {
        method: "POST",
        headers: { "Authorization": wcAuth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (res.ok) cleared++;
      else errs.push({ wc_lead_id: l.wc_lead_id, status: res.status, msg: (await res.text()).slice(0, 140) });
    }

    return Response.json({ ok: true, account: accountId, attempted: (leads ?? []).length, cleared, errors: errs.slice(0, 10) });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
