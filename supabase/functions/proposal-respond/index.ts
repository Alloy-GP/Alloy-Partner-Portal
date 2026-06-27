import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-respond — the board's response from the anonymous board page:
//   changes  → "requested changes" (areas + specifics). Status unchanged.
//   decline  → reason + notes. Flips proposal status to 'declined'.
//   continue → board is moving forward: booked a discovery call (slot) OR asked
//              to connect by email. Status UNCHANGED — "continue" is a soft
//              signal, not a binding accept; staff closes the deal after.
//
// Anonymous (no portal session), so gated ONLY by board_token (same bearer model
// as proposal-track/board). Records a proposal_events row (label in section_name
// for the Close feed, full payload in `meta`); decline also updates status via
// the service role. verify_jwt: true (anon key clears the gateway).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const ACTIONS = new Set(["changes", "decline", "continue"]);
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const action = String(body?.action || "").trim();
    if (!token || token.length > 128) return json({ error: "token required" }, 400);
    if (!ACTIONS.has(action)) return json({ error: "bad action" }, 400);

    // Cap the structured payload so a hostile link-holder can't bloat the row.
    let meta: Record<string, unknown> = {};
    if (body?.meta && typeof body.meta === "object") {
      try { if (JSON.stringify(body.meta).length <= 4000) meta = body.meta; } catch { /* ignore */ }
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: prop, error: e1 } = await admin
      .from("proposals").select("id, account_id").eq("board_token", token).maybeSingle();
    if (e1) return json({ error: "lookup_failed" }, 500);
    if (!prop) return json({ error: "invalid_token" }, 403);

    const { error: e2 } = await admin.from("proposal_events").insert({
      proposal_id: prop.id,
      account_id: prop.account_id,
      viewer_key: str(body?.viewerKey ?? body?.viewer_key, 64),
      viewer_name: str(body?.viewerName ?? body?.viewer_name, 80),
      event_type: "cta",
      section_name: str(body?.label, 140) || action,
      meta: { action, ...meta },
    });
    if (e2) return json({ error: "insert_failed", detail: e2.message }, 500);

    // A decline is the only response that moves the pipeline. "continue" stays
    // 'sent' on purpose (soft signal); "changes" stays 'sent' (revise + resend).
    if (action === "decline") {
      await admin.from("proposals").update({ status: "declined" }).eq("id", prop.id);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
