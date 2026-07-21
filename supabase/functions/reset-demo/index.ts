import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// reset-demo -- (re)seed the Northstar Community Management DEMO account's
// proposal pipeline to a pristine, prospect-safe set. Wipes the demo account's
// proposals + events, then inserts 8 fictional HOA boards spread across every
// stage (New / Build / Sent / Won / Lost). No real client data, nothing wired:
// leads carry selected_pains so the deterministic matcher renders rich concerns
// (no LLM), and every recipient email is the account owner so a live "Send"
// during a demo lands in your own inbox.
//
// HARD-SCOPED to the demo account id -- it can never touch a real client.
// Staff-only. verify_jwt: true.

const DEMO = "de300000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "skyler@alloygp.co"; // live "Send" during a demo lands here

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const BOARDS: any[] = [
  // ---- NEW (intake inbox) ----
  { leadKey: "NS-SABAL-01", community: "Sabal Palm Villas", contact: "Marcus Bell", role: "Board President", first: "Marcus",
    city: "Naples, FL", homes: 84, phone: "(239) 555-0142", metaType: "Condominium (switching providers)", metaStatus: "Switching providers",
    dues: "$310.00 monthly", timeline: "Decision within 30 days", budget: "Mid-range -- wants responsiveness",
    quote: "Our current manager takes days to reply and we can't get a straight answer on our reserves. The board wants out but we're nervous about a messy handoff.",
    received: "Jul 2, 2026 * 10:12 AM", status: "new", owner: "AB", perHome: 9.0, token: "nsdemo1sabalpalmvillas000000000000000000000001",
    pains: ["communication", "transparency", "switching", "delinquency"] },
  { leadKey: "NS-KING-02", community: "Kingfisher Landing", contact: "Dana Ruiz", role: "Treasurer", first: "Dana",
    city: "Cape Coral, FL", homes: 112, phone: "(239) 555-0198", metaType: "Single-family (self-managed)", metaStatus: "Self-managed by board",
    dues: "$220.00 monthly", timeline: "Engage within 60 days", budget: "$500K operating budget",
    quote: "We've self-managed for years and the volunteers are burning out. No real portal, vendors are a headache, and homeowners tune us out.",
    received: "Jul 3, 2026 * 2:41 PM", status: "new", owner: "JR", perHome: 8.0, token: "nsdemo2kingfisherlanding0000000000000000000002",
    pains: ["volunteer", "tech", "vendor-issues", "homeowner-apathy"] },
  // ---- BUILD (qualified, not yet sent) ----
  { leadKey: "NS-CYPB-03", community: "Cypress Bend HOA", contact: "Priya Nair", role: "Board Member", first: "Priya",
    city: "Fort Myers, FL", homes: 140, phone: "(239) 555-0175", metaType: "Single-family (switching providers)", metaStatus: "Switching providers",
    dues: "$95.00 monthly", timeline: "Decision within 45 days", budget: "Willing to invest for the right partner",
    quote: "Enforcement is all over the place, nothing gets done proactively, and our last two managers left within a year. We want consistency.",
    received: "Jun 26, 2026 * 9:05 AM", status: "review", owner: "AB", perHome: 7.75, token: "nsdemo3cypressbendhoa00000000000000000000000003",
    pains: ["reactive", "compliance", "manager-turnover", "switching"] },
  { leadKey: "NS-HERON-04", community: "Heron Cove Condominiums", contact: "Tom Alcott", role: "President", first: "Tom",
    city: "Sarasota, FL", homes: 96, phone: "(941) 555-0110", metaType: "Condominium (switching providers)", metaStatus: "Switching providers",
    dues: "$365.00 monthly", timeline: "Decision within 30 days", budget: "Mid-range",
    quote: "We never hear back, the books are a black box, and the tech is ancient. We want transparency and a real portal for owners.",
    received: "Jun 28, 2026 * 4:22 PM", status: "review", owner: "JR", perHome: 8.5, token: "nsdemo4heroncovecondos0000000000000000000000004",
    pains: ["communication", "transparency", "tech", "delinquency"] },
  // ---- SENT (out for signature, with engagement) ----
  { leadKey: "NS-MAGR-05", community: "Magnolia Ridge", contact: "Karen Diaz", role: "Secretary", first: "Karen",
    city: "Bradenton, FL", homes: 122, phone: "(941) 555-0187", metaType: "Single-family (switching providers)", metaStatus: "Switching providers",
    dues: "$140.00 monthly", timeline: "Decision within 30 days", budget: "Mid-range",
    quote: "Constant manager turnover has us starting over every year. We want one team that knows our community and stays.",
    received: "Jun 20, 2026 * 11:30 AM", status: "sent", owner: "AB", perHome: 8.25, token: "nsdemo5magnoliaridge00000000000000000000000005",
    pains: ["manager-turnover", "reactive", "transparency", "switching"], sentDays: 4,
    events: [{ type: "open", name: "Karen Diaz", days: 3 }, { type: "section", name: "Karen Diaz", section: "How we answer it", pct: 90, days: 3 }, { type: "open", name: "Board member", days: 1 }] },
  { leadKey: "NS-OAKM-06", community: "Oakmont Terrace HOA", contact: "Greg Sutton", role: "President", first: "Greg",
    city: "Estero, FL", homes: 168, phone: "(239) 555-0163", metaType: "Single-family (self-managed)", metaStatus: "Self-managed by board",
    dues: "$85.00 monthly", timeline: "Engage within 60 days", budget: "$700K operating budget",
    quote: "Volunteers are stretched thin, vendors run us in circles, and compliance is a mess. We need to take this off our plate.",
    received: "Jun 22, 2026 * 3:15 PM", status: "sent", owner: "JR", perHome: 7.5, token: "nsdemo6oakmontterrace00000000000000000000000006",
    pains: ["volunteer", "vendor-issues", "compliance", "tech"], sentDays: 6,
    events: [{ type: "open", name: "Greg Sutton", days: 5 }, { type: "section", name: "Greg Sutton", section: "Pricing", pct: 80, days: 5 }] },
  // ---- WON ----
  { leadKey: "NS-PALM-07", community: "Palmetto Grove", contact: "Yvonne Carter", role: "President", first: "Yvonne",
    city: "Bonita Springs, FL", homes: 130, phone: "(239) 555-0129", metaType: "Single-family (switching providers)", metaStatus: "Switching providers",
    dues: "$120.00 monthly", timeline: "Decision within 30 days", budget: "Mid-range",
    quote: "Slow responses and rising delinquency pushed us to look. We want responsiveness and clean books.",
    received: "Jun 10, 2026 * 8:50 AM", status: "accepted", owner: "AB", perHome: 8.75, token: "nsdemo7palmettogrove000000000000000000000000007",
    pains: ["communication", "switching", "delinquency", "transparency"], sentDays: 9,
    boardResponse: { action: "continue", by: "Yvonne Carter", atDays: 2 },
    events: [{ type: "open", name: "Yvonne Carter", days: 8 }, { type: "section", name: "Yvonne Carter", section: "How we answer it", pct: 100, days: 8 }, { type: "cta", name: "Yvonne Carter", section: "Booked a discovery call * Thu 2:00 PM", meta: { action: "continue", method: "call" }, days: 2 }] },
  // ---- LOST ----
  { leadKey: "NS-WIND-08", community: "Windward Pointe Condos", contact: "Rick Nolan", role: "Treasurer", first: "Rick",
    city: "Punta Gorda, FL", homes: 76, phone: "(941) 555-0154", metaType: "Condominium", metaStatus: "Evaluating options",
    dues: "$395.00 monthly", timeline: "No rush", budget: "Cost-sensitive",
    quote: "Mostly happy with our current setup but wanted to compare. Tech and compliance are the only gaps.",
    received: "Jun 12, 2026 * 1:05 PM", status: "declined", owner: "JR", perHome: 7.0, token: "nsdemo8windwardpointe00000000000000000000000008",
    pains: ["tech", "compliance"], sentDays: 7,
    boardResponse: { action: "decline", by: "Rick Nolan", atDays: 3 },
    events: [{ type: "open", name: "Rick Nolan", days: 6 }, { type: "cta", name: "Rick Nolan", section: "Declined: Staying with current provider", meta: { action: "decline", reason: "Staying with current provider" }, days: 3 }] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") || "";
    // Staff-only: verify the caller via their JWT.
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData } = await userClient.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await userClient.from("profiles").select("is_staff").eq("id", uid).maybeSingle();
    if (!profile?.is_staff) return json({ error: "forbidden" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Wipe (scoped to the demo account only -- never a real client).
    await admin.from("proposal_events").delete().eq("account_id", DEMO);
    await admin.from("proposals").delete().eq("account_id", DEMO);

    const rows = BOARDS.map((b, i) => ({
      account_id: DEMO, lead_key: b.leadKey, sort: i,
      community: b.community, contact: b.contact, contact_role: b.role, first_name: b.first,
      city: b.city, homes: b.homes, email: DEMO_EMAIL, phone: b.phone,
      meta_type: b.metaType, meta_status: b.metaStatus, dues: b.dues,
      engage_timeline: b.timeline, budget: b.budget, quote: b.quote, received: b.received,
      status: b.status, priority: false, disq: false, disq_reason: "", owner: b.owner,
      link_expires: "", selected_pains: b.pains, tier_id: "full",
      per_home: b.perHome, quote_value: Math.round(b.perHome * b.homes), notes: [],
      board_token: b.token, sent_at: b.sentDays ? daysAgo(b.sentDays) : null,
      match_snapshot: null,
      board_response: b.boardResponse ? { action: b.boardResponse.action, by: b.boardResponse.by, at: daysAgo(b.boardResponse.atDays) } : null,
    }));
    const { data: inserted, error } = await admin.from("proposals").insert(rows).select("id, lead_key");
    if (error) return json({ error: "insert_failed", detail: error.message }, 500);

    const byKey: Record<string, string> = {};
    for (const p of inserted || []) byKey[p.lead_key] = p.id;
    const events: any[] = [];
    for (const b of BOARDS) {
      for (const e of b.events || []) {
        events.push({
          proposal_id: byKey[b.leadKey], account_id: DEMO,
          viewer_key: "demo-" + String(e.name || "viewer").toLowerCase().replace(/[^a-z]/g, ""),
          viewer_name: e.name || "", event_type: e.type, section_name: e.section || "",
          pct: e.pct ?? 0, meta: e.meta || {}, created_at: daysAgo(e.days),
        });
      }
    }
    if (events.length) {
      const { error: evErr } = await admin.from("proposal_events").insert(events);
      if (evErr) return json({ error: "events_failed", detail: evErr.message }, 500);
    }

    return json({ ok: true, account: DEMO, proposals: rows.length, events: events.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
