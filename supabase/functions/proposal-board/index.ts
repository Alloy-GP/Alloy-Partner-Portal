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
// internal/PII-ish fields (email, phone, status, disq, notes, sales). It DOES
// return `owner` (the rep initials) so the doc can name the point of contact.
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

    // Board-safe columns only — never select email/phone/notes/sales/etc.
    // (owner IS included — the board's point of contact.)
    const { data: row, error } = await admin
      .from("proposals")
      .select("account_id, lead_key, board_token, community, contact, contact_role, first_name, city, homes, meta_type, meta_status, dues, engage_timeline, budget, quote, received, selected_pains, tier_id, per_home, quote_value, link_expires, sent_at, match_snapshot, owner, board_response")
      .eq("board_token", token)
      .maybeSingle();
    if (error) return json({ error: "lookup_failed" }, 500);
    if (!row) return json({ error: "invalid_token" }, 404);

    // The account's REAL people, so the document names an actual human. A prospect
    // has no session and therefore no DATA.team, which is why this has to travel
    // in the payload — without it the doc fell back to the CAM profile, and that
    // fallback is how a board could be told their contact was "Jordan R.", who
    // does not work at CMGT.
    //
    // NAMES ONLY, and client-side people only. profiles holds no email (it lives
    // in auth.users), and Alloy staff are excluded: the board's contact is the
    // CAM's own person, not whoever at Alloy touched the record.
    const { data: teamRows } = await admin
      .from("profiles")
      .select("id, name, initials, role, is_staff, title")
      .eq("account_id", row.account_id)
      .eq("is_staff", false);
    const initialsOf = (name: string) => {
      const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return "";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };
    const usedInitials = new Set<string>();
    const owners = (teamRows ?? [])
      .filter((p: any) => String(p.name || "").trim())
      .map((p: any) => {
        const base = (p.initials && String(p.initials).trim().toUpperCase()) || initialsOf(p.name);
        let key = base || "XX";
        for (let i = 0; usedInitials.has(key); i++) key = base + String.fromCharCode(66 + i);
        usedInitials.add(key);
        const first = String(p.name).trim().split(/\s+/)[0] || "";
        const role = String(p.title || "").trim() || (p.role === "owner" ? "Owner" : p.role === "accounting" ? "Accounting" : "Team");
        return { initials: key, name: p.name, first, role, id: p.id };
      });

    // Map to the raw lead shape the client's enrichLead consumes (camelCase).
    const proposal = {
      owners,
      id: row.lead_key,
      accountId: row.account_id, // which CAM this belongs to → the doc's white-label identity
      boardToken: row.board_token,
      community: row.community, contact: row.contact, contactRole: row.contact_role, firstName: row.first_name,
      city: row.city, homes: row.homes,
      metaType: row.meta_type, metaStatus: row.meta_status, dues: row.dues,
      engageTimeline: row.engage_timeline, budget: row.budget, quote: row.quote, received: row.received,
      selectedPains: row.selected_pains || [], tierId: row.tier_id,
      perHome: Number(row.per_home) || 0,
      quoteValue: row.quote_value != null ? row.quote_value : undefined,
      linkExpires: row.link_expires, sentAt: row.sent_at || null,
      // The assigned rep (owner initials) so the doc can name who reaches out
      // ("Jordan will email you…") instead of a hardcoded person. Board-safe:
      // the board should know their point of contact.
      owner: row.owner || null,
      // The CAM's edited match (concern adds/removes/toggles/text) is the source
      // of truth for what the board sees — enrichLead prefers it over the baked
      // demo match. Without this the doc shows the un-edited concerns.
      matchSnapshot: row.match_snapshot || null,
      // The board's verdict so far ({action, by, at} or null) — the doc shows a
      // resolved banner to everyone once it's set, so a later viewer sees the
      // decision instead of live buttons. Board-safe (it's the board's own call).
      boardResponse: row.board_response || null,
    };
    return json({ proposal });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
