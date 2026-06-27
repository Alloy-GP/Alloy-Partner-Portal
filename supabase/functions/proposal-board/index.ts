import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-board — the anonymous board READ (the magic-link destination).
//
// A logged-out HOA board member opens proposal.<cam>.org/…/board/<board_token>.
// They have NO portal session, so RLS can't serve them — this fn does, gated
// ONLY by the unguessable board_token (bearer semantics: whoever holds the link
// can view it; that's intended — boards forward links to each other). The
// service role reads the proposal and returns a BOARD-SAFE subset: the board's
// own submission + what's needed to render the doc. It deliberately omits
// internal/PII-ish fields (email, phone, owner, status, disq, notes, sales).
//
// The client then enriches it locally (matcher + UVP prose are in the bundle)
// and renders the same board doc the cockpit preview shows.
//
// verify_jwt: true — the anon key (already in the bundle) clears the gateway;
// the board_token in the body is the real, per-proposal credential.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!token || token.length > 128) return json({ error: "token required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Board-safe columns only — never select email/phone/owner/notes/etc.
    const { data: row, error } = await admin
      .from("proposals")
      .select("lead_key, board_token, community, contact, contact_role, first_name, city, homes, meta_type, meta_status, dues, engage_timeline, budget, quote, received, selected_pains, tier_id, per_home, quote_value, link_expires, sent_at")
      .eq("board_token", token)
      .maybeSingle();
    if (error) return json({ error: "lookup_failed" }, 500);
    if (!row) return json({ error: "invalid_token" }, 404);

    // Map to the raw lead shape the client's enrichLead consumes (camelCase).
    const proposal = {
      id: row.lead_key,
      boardToken: row.board_token,
      community: row.community, contact: row.contact, contactRole: row.contact_role, firstName: row.first_name,
      city: row.city, homes: row.homes,
      metaType: row.meta_type, metaStatus: row.meta_status, dues: row.dues,
      engageTimeline: row.engage_timeline, budget: row.budget, quote: row.quote, received: row.received,
      selectedPains: row.selected_pains || [], tierId: row.tier_id,
      perHome: Number(row.per_home) || 0,
      quoteValue: row.quote_value != null ? row.quote_value : undefined,
      linkExpires: row.link_expires, sentAt: row.sent_at || null,
    };
    return json({ proposal });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
