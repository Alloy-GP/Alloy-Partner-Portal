import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-respond — the board's response from the anonymous board page:
//   changes  → "requested changes" (areas + specifics).
//   decline  → reason + notes.
//   continue → board is moving forward: booked a discovery call (slot) OR asked
//              to connect by email. "continue" is a soft signal, not a binding
//              accept; staff closes the deal after.
//   question → a board member's question/note. NON-verdict: recorded as an event
//              only (voice), never changes board_response or status.
//
// VOICE vs VERDICT: the board_token link is forwarded among members. Every
// response is recorded as a proposal_events row (voice/audit). But the VERDICT
// (continue/decline/changes) is singular and FORWARD-ONLY — the first one wins
// and is stored on proposals.board_response {action, by, at}. Later responders
// can't flip it (their event still records their view); the board doc then shows
// a resolved banner to everyone. decline (as the winning verdict) also flips
// status to 'declined'. proposal-send clears board_response to reopen on resend.
//
// Anonymous (no portal session), gated ONLY by board_token (same bearer model as
// proposal-track/board). verify_jwt: true (anon key clears the gateway).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const VERDICTS = new Set(["changes", "decline", "continue"]); // singular, forward-only
const ACTIONS = new Set(["changes", "decline", "continue", "question"]); // + voice
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
      .from("proposals").select("id, account_id, board_response, status").eq("board_token", token).maybeSingle();
    if (e1) return json({ error: "lookup_failed" }, 500);
    if (!prop) return json({ error: "invalid_token" }, 403);

    const by = str(body?.viewerName ?? body?.viewer_name, 80);

    // Always record the event — this is the per-viewer voice/audit trail (every
    // question and every response, winning or not, shows in the cockpit feed).
    const { error: e2 } = await admin.from("proposal_events").insert({
      proposal_id: prop.id,
      account_id: prop.account_id,
      viewer_key: str(body?.viewerKey ?? body?.viewer_key, 64),
      viewer_name: by,
      event_type: "cta",
      section_name: str(body?.label, 140) || action,
      meta: { action, ...meta },
    });
    if (e2) return json({ error: "insert_failed", detail: e2.message }, 500);

    // The VERDICT: forward-only. The first continue/decline/changes wins and is
    // stored on the proposal; a later responder's event is kept (their voice) but
    // the verdict does NOT change — so no one can silently flip an accept to a
    // change-request. decline (as the winning verdict) also moves the pipeline.
    let boardResponse = (prop.board_response as Record<string, unknown> | null) || null;
    if (VERDICTS.has(action) && !boardResponse) {
      boardResponse = { action, by: by || "A board member", at: new Date().toISOString() };
      const upd: Record<string, unknown> = { board_response: boardResponse };
      // Only a proposal still OUT FOR SIGNATURE can be moved by a board click.
      // The cockpit can now set any stage by hand (won/lost/back to build), and
      // the board's magic link keeps working after a demote — so without this
      // check a single decline click would silently overwrite a hand-set Won, or
      // re-close something the owner deliberately reopened. The verdict is still
      // recorded either way; it just no longer outranks the human.
      if (action === "decline" && prop.status === "sent") upd.status = "declined";
      await admin.from("proposals").update(upd).eq("id", prop.id);
    }

    // Return the authoritative (winning) verdict so a racing responder's doc
    // immediately reflects the real state, not their own losing click.
    return json({ ok: true, boardResponse });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
