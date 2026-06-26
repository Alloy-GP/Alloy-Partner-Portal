import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-track — the anonymous board-write telemetry seam (Close analytics).
//
// The white-label board surface (anonymous; no portal session) POSTs engagement
// events here as a board member reads a proposal: opens, per-section read depth,
// dwell, CTA clicks. The ONLY auth is the proposal's `board_token` in the body —
// validated against the proposals table before anything is written. A matching
// token resolves the proposal; the service role then appends one row to
// proposal_events (which has NO client insert policy, so this fn is the only
// writer). Never reads or returns any proposal content — write-only by design.
//
// verify_jwt: true — the board sends the public anon key (already in the bundle)
// to clear the gateway; the board_token is the real, per-proposal credential.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const EVENT_TYPES = new Set(["open", "section", "heartbeat", "cta"]);
const clampPct = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const clampMs = (n: unknown) => Math.max(0, Math.min(86_400_000, Math.round(Number(n) || 0))); // ≤ 24h
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const eventType = String(body?.eventType || body?.event_type || "").trim();
    if (!token || token.length > 128) return json({ error: "token required" }, 400);
    if (!EVENT_TYPES.has(eventType)) return json({ error: "bad event_type" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The board's only credential: resolve the proposal by its token. Unknown
    // token → reject (no event written, no information leaked).
    const { data: prop, error: e1 } = await admin
      .from("proposals").select("id, account_id").eq("board_token", token).maybeSingle();
    if (e1) return json({ error: "lookup_failed" }, 500);
    if (!prop) return json({ error: "invalid_token" }, 403);

    const { error: e2 } = await admin.from("proposal_events").insert({
      proposal_id: prop.id,
      account_id: prop.account_id,
      viewer_key: str(body?.viewerKey ?? body?.viewer_key, 64),
      viewer_name: str(body?.viewerName ?? body?.viewer_name, 80),
      event_type: eventType,
      section_name: str(body?.section ?? body?.section_name, 120),
      pct: clampPct(body?.pct),
      ms: clampMs(body?.ms),
    });
    if (e2) return json({ error: "insert_failed", detail: e2.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
