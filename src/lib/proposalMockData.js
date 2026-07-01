// ============================================================================
// Proposal system — MOCK DATA (no database), v2 pipeline shape.
//
// Stands in for what will load per-CAM from Supabase. The portal runs on mock
// data when Supabase env vars are absent, so nothing here touches the live DB.
//
// Shape mirrors the v2 design handoff (proposal/data.js + v2-data.js): a client
// (CMGT) with its OWN unique UVP library + a pain taxonomy, and a pipeline of
// leads (Pending → Qualified → Closed). Each lead's match (overall %, per-concern
// fit, concern→UVP links) is computed LIVE by the engine (src/lib/proposalMatch.js)
// from the board's intake pains — not hand-authored — so it recomputes if the
// pains change. The per-concern prose is editorial (an LLM layer rewrites it later).
//
// Per the product decisions: UVPs are per-client and unique; pain points are a
// shared canned list the board selects from (later: custom/open).
// ============================================================================

import { deriveLeadMatch } from "./proposalMatch.js";
import { LLM_MATCHES } from "./proposalLLMMatches.generated.js";
import { DATA } from "../data.js";
// UVPs live in ONE canonical place (the backbone). Re-export so existing
// `import { UVPS, UVP_TITLES, UVP_BLURBS } from proposalMockData` keep working.
import { UVPS } from "./proposalUVPs.js";
export { UVPS, UVP_TITLES, UVP_BLURBS } from "./proposalUVPs.js";

// ---------- The CAM company (CMGT) ----------
export const CAM_COMPANY = {
  name: "CMGT",
  fullName: "Community Management, LLC",
  shortName: "CMGT",
  tagline: "We Manage. You Live.",
  city: "Denham Springs, LA",
  founded: 2007,
  portfolios: 400,
  doors: 60000,
  managers: 91,
  states: 5,
  brand: { primary: "#2b2c6c", deep: "#3D1A52", accent: "#74c275" },
};

export const TEAM = [
  { initials: "JH", name: "Jeff Harman", role: "CEO & Founder", color: "#aed7d0", note: "Founded CMGT in 2007. Built the pod model. Will be on your discovery call." },
  { initials: "AB", name: "Amanda Betancourt", role: "COO", color: "#a1c8e7", note: "Operations and marketing. Personal check-in with every new board at Day 60." },
  { initials: "AM", name: "Ashley Melancon", role: "CFO", color: "#f5d880", note: "Runs the finance function — why your monthly P&L hits by the 20th." },
  { initials: "CT", name: "Chris Tremblay", role: "Chief Real Estate Officer", color: "#d9356e", note: "13 years with CMGT. Now runs developer and vendor relationships." },
];

// 90-day onboarding timeline shown in the board proposal.
export const TIMELINE = [
  { day: "Day 1", t: "Documents handed off", d: "All onboarding documents obtained from your previous management company." },
  { day: "Day 5", t: "Homeowners introduced", d: "Communications sent to all homeowners introducing CMGT." },
  { day: "Day 10", t: "Financials in hand", d: "Financial records and operational information obtained." },
  { day: "Day 15", t: "Credentials secured", d: "Beginning balance checks, homeowner balances confirmed, gate codes, fobs, all credentials." },
  { day: "Day 20", t: "Meet every department", d: "20-day onboarding meeting — all department supervisors attend so the board can ask questions." },
  { day: "Day 30", t: "Go live", d: "Mail & email to homeowners. Contact transfers from the Onboarding Team to your assigned CAM." },
  { day: "Day 45", t: "First site inspection", d: "Inspection complete. Letter to homeowners on findings + quick reference guide created." },
  { day: "Day 60", t: "CEO welcome", d: "CEO sends a personal welcome. COO checks in. Owners can log in and see last month's financials." },
  { day: "Day 90", t: "First violation round", d: "First enforcement round complete. CAM Supervisor follows up at Day 120, then semi-annual." },
];

// What the recommended (Full-Service) tier includes — shown in the proposal.
export const INCLUDES = [
  "Dedicated CAM + full pod (AP, AR, site visits, customer support, ARC)",
  "Assessment collection + in-house collections team",
  "Vendor coordination + maintenance oversight",
  "Annual budget + reserve planning",
  "Insurance claim assistance",
  "Complete financial management + monthly P&L to all homeowners",
  "Board meeting prep, attendance, and minutes",
  "Covenant enforcement with educational-first approach",
  "Vantaca board portal + CMGT mobile app",
];

// Proposal section skeleton (the Build checklist). Required sections lock on;
// one editable section per matched concern, seeded with the concern's prose.
function buildSections(concerns) {
  return [
    { id: "cover", title: "Cover & intro", note: "Greeting + concerns overview", required: true, editable: false, on: true },
    ...concerns.map((c, i) => ({ id: "pain" + i, title: c.label, note: "Pain → answer with metric", required: false, editable: true, on: true, prose: c.body })),
    { id: "built", title: "How this was built", note: "Show the matching reasoning", required: false, editable: false, on: true },
    { id: "pricing", title: "Pricing tiers", note: "Recommended tier + the math", required: true, editable: false, on: true },
    { id: "team", title: "Your team", note: "The humans behind the work", required: false, editable: false, on: true },
    { id: "first90", title: "First 90 days", note: "30/60/90 onboarding plan", required: false, editable: false, on: true },
    { id: "cta", title: "Discovery call CTA", note: "Schedule or reply by email", required: true, editable: false, on: true },
  ];
}

// UVPs are imported from the canonical proposalUVPs.js (re-exported at top of file).

// ---------- Pain-point taxonomy (shared canned list, with matching tags) ----------
export const PAIN_POINTS = [
  { id: "communication", label: "Slow communication — missed calls, no follow-through", tags: ["communication", "responsiveness", "after-hours"] },
  { id: "delinquency", label: "Delinquency creeping up — collections aren't working", tags: ["delinquency", "collections", "financial"] },
  { id: "manager-turnover", label: "Manager turnover — constant relationship rebuilding", tags: ["manager-turnover", "stability", "relationships"] },
  { id: "transparency", label: "Financial opacity — we don't understand our own books", tags: ["transparency", "reporting", "tech", "financial"] },
  { id: "reactive", label: "Reactive management — problems only addressed after escalation", tags: ["responsiveness", "modern"] },
  { id: "switching", label: "Switching providers — worried about disruption", tags: ["switching", "transition", "onboarding"] },
  { id: "volunteer", label: "Volunteer burden — board is burning out", tags: ["communication", "responsiveness", "team-based"] },
  { id: "compliance", label: "Compliance pressure — fair housing, fiduciary, state law", tags: ["compliance", "covenant"] },
  { id: "tech", label: "Tech is dated — no real portal or app", tags: ["tech", "modern", "reporting"] },
  { id: "homeowner-apathy", label: "Homeowner apathy — no one sees the HOA's value", tags: ["transparency", "communication"] },
  { id: "vendor-issues", label: "Vendor management headaches", tags: ["vendor-management", "maintenance"] },
  { id: "gulf-south", label: "Need someone who knows Gulf South realities", tags: ["gulf-south", "regional"] },
  { id: "developer", label: "Developer-controlled community needing professional setup", tags: ["new-community", "developer", "transition"] },
];

// ---------- Pain prose (editorial; LLM rewrites against the board's narrative later) ----------
export const PAIN_PROSE = {
  "communication": { headline: "When you call, a human picks up. And follows through.", body: "You said your current company doesn't return calls. We measure call timeliness — our portfolio average is 97%. The pod model means the people answering your community's calls aren't your CAM scrambling between meetings; they're a support team whose entire job is to listen, route, and follow up.", metric: { value: "97%", label: "Call timeliness rate" } },
  "delinquency": { headline: "Collections start with transparency, not threats.", body: "When homeowners see the financials and understand where their assessments go, they pay. Average delinquency across our portfolio sits at 10%, well below industry. Our in-house team handles late accounts with compassion first.", metric: { value: "10%", label: "Avg portfolio delinquency" } },
  "manager-turnover": { headline: "Your manager isn't carrying the whole job alone.", body: "Managers burn out because they're asked to do everyone else's job too. We're built differently — your CAM is the relationship; specialist departments handle the load. ~91 people supporting ~400 communities. You learn your CAM; your CAM learns your community.", metric: { value: "91", label: "Team members across 5 states" } },
  "transparency": { headline: "Your books, your dashboard, every homeowner — every month.", body: "We were one of the first nationally to send full monthly P&L to every homeowner, not just the board. Financials hit by the 20th, every month. It's written into the management agreement.", metric: { value: "Day 20", label: "Monthly financials delivered" } },
  "reactive": { headline: "We try to solve problems before you know they exist.", body: "Reactive management means firefighting. We're built for the opposite — site visits on a cadence, vendor compliance monitored continuously, insurance and reserves handled by a dedicated department. The board meets to decide, not to chase.", metric: { value: "Daily", label: "Department standups" } },
  "switching": { headline: "Transition handled down to the day.", body: "Switching is the single biggest risk on a board's plate. Our 90-day onboarding is documented by day: docs by Day 1, communications by Day 5, financials by Day 10, credentials by Day 15, a 20-day meeting with every department head, go-live at Day 30. The CEO emails you personally at Day 60.", metric: { value: "90 days", label: "Documented onboarding" } },
  "volunteer": { headline: "We carry the weight your board shouldn't be carrying.", body: "You're volunteers with full-time jobs and lives outside of this. The pod model exists so running a community feels less like a second job. Your CAM holds the relationship; AP processes invoices, AR chases delinquency, site specialists walk the property, support fields homeowner calls. You get your time back.", metric: { value: "1", label: "Primary contact · backed by a pod" } },
  "compliance": { headline: "Covenant enforcement, handled with compassion.", body: "We send an educational letter before the first violation round so homeowners know the rules before they break them. We process violations with the tone of a neighbor, not a court summons. Fair housing, fiduciary, and state law are watched by people whose job is to watch them.", metric: { value: "Educate", label: "First, enforce second" } },
  "tech": { headline: "Software you actually want to log into.", body: "Vantaca powers your board portal, our mobile app, and your homeowner experience. Board members approve ARC requests, pay invoices, and pull documents in one place. 70% of homeowners across our portfolio actually use it, and 56% of payments come through online.", metric: { value: "70%", label: "Active homeowner portal use" } },
  "homeowner-apathy": { headline: "Transparency turns homeowners into participants.", body: "When homeowners can see where their money goes and what it's doing, they start caring. They pay on time. They show up to meetings. Full-membership financial transparency is the lever that fixes the homeowner relationship problem most communities have.", metric: { value: "Monthly", label: "P&L to every homeowner" } },
  "vendor-issues": { headline: "Fewer vendors. Same accountability. In-house option.", body: "Fix-It Squad — our in-house maintenance team — handles common area repairs for communities that want one number to call. For everything else, vendor relationships are managed by a team that knows your community. We get paid by you, and we act like it.", metric: { value: "1", label: "Vendor relationship · one phone line" } },
  "gulf-south": { headline: "Largest in Louisiana. Largest on the Mississippi Gulf Coast.", body: "We've been managing Gulf South communities since 2007. We survived the 2016 Great Flood and came back stronger. We know FEMA zones, hurricane prep, and the regional realities national firms underestimate.", metric: { value: "19 yrs", label: "Gulf South operations" } },
  "developer": { headline: "Developer-to-homeowner handoff, by a team that's done it.", body: "Our Developer Management Program runs new communities from groundbreaking through homeowner board turnover — admin setup, utilities, insurance, banking, the operational handoff. Most communities stay with us once they take control.", metric: { value: "DCM", label: "Dedicated team" } },
};

// ---------- Service tiers ----------
export const TIERS = [
  { id: "full", name: "Full-Service Management", recommended: true, rateRange: "$4.50 – $25.00", defaultRate: 8.98, setupFee: 0 },
  { id: "financial", name: "Financial & Administrative", rateRange: "$2.00 – $10.00", defaultRate: 4.0, setupFee: 0 },
  { id: "onsite", name: "On-Site Management", rateRange: "≈ $2,500 / month", defaultRate: null, setupFee: 0 },
];

// ---------- Leads (the pipeline) ----------
// status: new=Pending · review/draft/sent=Qualified · accepted=Won · declined=Lost · disq=Not quotable (→ Closed)
export const LEADS_RAW = [
  {
    id: "HOL-2026-LA93", community: "Hollywood Hills", contact: "Harry Houdini", contactRole: "Board President", firstName: "Harry",
    city: "Baton Rouge, LA", homes: 93, status: "new", priority: true, owner: "AB", perHome: 8.98, received: "May 21, 2026 · 9:42 AM",
    email: "hocuspocus@gmail.com", phone: "(225) 879-0321", metaType: "Single-family (self-managed)", metaStatus: "Self-managed by board",
    dues: "$450.00 annually", engageTimeline: "Engage within 60 days", budget: "Cost-sensitive — board is volunteer-run and managing a tight budget",
    selectedPains: ["volunteer", "tech", "homeowner-apathy", "vendor-issues"],
    quote: "We got CMGT's number from a friend in another community we manage. Our current board has been volunteering for a few years and is tired of handling all of it. We've never had professional management, so the budget is tight — we just need a partner who can take this off our plate.",
  },
  {
    id: "CYP-2026-LA48", community: "Cypress Lakes Condominiums", contact: "Renee Thibodaux", contactRole: "Treasurer", firstName: "Renee",
    city: "Mandeville, LA", homes: 148, status: "review", owner: "AB", perHome: 7.5, received: "May 20, 2026 · 2:10 PM",
    email: "rthibodaux@cypresslakescondo.org", phone: "(985) 624-1180", metaType: "Condominium (switching providers)", metaStatus: "Switching providers",
    dues: "$285.00 monthly", engageTimeline: "Decision within 30 days", budget: "Mid-range — willing to pay for responsiveness",
    selectedPains: ["communication", "delinquency", "switching", "transparency"],
    quote: "Our current management company stopped returning calls six months ago, delinquency is climbing, and we have no idea where our reserves actually stand. We need out, but the board is terrified of a messy transition.",
  },
  {
    id: "OAK-2026-LA61", community: "Oak Grove HOA", contact: "Renata Olivier", contactRole: "Treasurer", firstName: "Renata",
    city: "Baton Rouge, LA", homes: 61, status: "sent", owner: "JR", perHome: 9.25, received: "May 18, 2026 · 11:02 AM", linkExpires: "Jun 19",
    email: "rolivier@oakgrovehoa.org", phone: "(225) 442-7781", metaType: "Single-family", metaStatus: "Professionally managed (unhappy)",
    dues: "$65.00 monthly", engageTimeline: "Comparing two firms before June meeting", budget: "Open to the right fit",
    selectedPains: ["communication", "transparency", "reactive"],
    quote: "Our reserves are healthy but our current manager is unresponsive and the books are a mess. The board wants real financial transparency and someone who actually picks up the phone.",
  },
  {
    id: "PEC-2026-LA08", community: "Pecan Trail Estates", contact: "Linette Boudreaux", contactRole: "Board President", firstName: "Linette",
    city: "Houma, LA", homes: 210, status: "sent", owner: "AB", perHome: 6.75, received: "May 12, 2026 · 4:32 PM",
    email: "lboudreaux@pecantrail.org", phone: "(985) 219-3340", metaType: "Single-family (master-planned)", metaStatus: "Switching providers",
    dues: "$120.00 monthly", engageTimeline: "Signed — onboarding in July", budget: "Value-driven, no nickel-and-diming",
    selectedPains: ["delinquency", "compliance", "vendor-issues"],
    quote: "Large association, aging amenities, and rising delinquencies. We need a firm that can handle collections fairly and keep capital projects on track without nickel-and-diming us.",
  },
  {
    id: "SEA-2026-MS22", community: "Seabrook Pointe", contact: "Marcus Whitley", contactRole: "Board Vice President", firstName: "Marcus",
    city: "Gulfport, MS", homes: 64, status: "sent", owner: "JR", perHome: 9.0, received: "May 9, 2026 · 11:05 AM",
    email: "mwhitley@seabrookpointe.org", phone: "(228) 555-7012", metaType: "Single-family (coastal, new board)", metaStatus: "First-time board",
    dues: "$80.00 monthly", engageTimeline: "Went with a local competitor", budget: "Tight first-year budget",
    selectedPains: ["switching", "tech", "manager-turnover"],
    quote: "New coastal community, first board. We don't know what good management looks like yet — we need a partner who can set up the systems right from the start and keep owners in the loop.",
  },
  {
    id: "MAG-2026-MS12", community: "Magnolia Trace", contact: "David Okonkwo", contactRole: "Developer Representative", firstName: "David",
    city: "Gulfport, MS", homes: 310, status: "new", disq: true, disqReason: "Outside service area", owner: "JR", perHome: 8.98, received: "Jun 3, 2026 · 11:08 AM",
    email: "dokonkwo@magnoliatracedev.com", phone: "(228) 770-4422", metaType: "Master-planned (developer-controlled)", metaStatus: "Developer-controlled, approaching turnover",
    dues: "$95.00 monthly", engageTimeline: "First closings in ~4 months", budget: "Developer-funded through turnover",
    selectedPains: ["developer", "gulf-south", "tech", "compliance"],
    quote: "We're a regional builder bringing our first master-planned community to market on the coast. We need a partner who knows Gulf South codes and can run the admin side cleanly from groundbreaking through turnover.",
  },
];

// ---------- Close — post-send engagement analytics (the "watch" data) ----------
// Keyed by lead id; heat is stored for demo realism (production derives it from
// recency of last open + open count + read depth — telemetry from the board page
// on proposal.cmgt.org). Only `sent` leads surface in Close.
const WATCH = {
  "PEC-2026-LA08": {
    heat: "hot", opens: 11, lastOpened: "47m ago", firstOpened: "May 18 · 7:14 PM",
    sentOn: "May 18", readTime: "13m 20s", scrollDepth: 98, expires: "Jun 14", daysLeft: 23, linkLife: 30,
    viewers: [
      { initials: "LB", name: "Linette Boudreaux", role: "Board President", opens: 6, lastSeen: "47m ago" },
      { initials: "CP", name: "Curtis Pelletier", role: "Treasurer", opens: 3, lastSeen: "Yesterday" },
      { initials: "DW", name: "Dana Whitfield", role: "Secretary", opens: 2, lastSeen: "May 19" },
    ],
    sections: [
      { name: "Cover & intro", pct: 100, status: "read" },
      { name: "Rising delinquencies", pct: 100, status: "read" },
      { name: "Capital projects stalling", pct: 92, status: "read" },
      { name: "Aging amenities & vendors", pct: 80, status: "read" },
      { name: "How this was built", pct: 45, status: "skimmed" },
      { name: "Pricing tiers", pct: 100, status: "read", note: "6m 02s — longest dwell" },
      { name: "Your team", pct: 88, status: "read" },
      { name: "First 90 days", pct: 95, status: "read" },
      { name: "Discovery call CTA", pct: 100, status: "read", note: "Clicked Schedule" },
    ],
    feed: [
      { when: "47m ago", who: "Linette Boudreaux", event: "Clicked “Schedule a discovery call”", type: "cta" },
      { when: "47m ago", who: "Linette Boudreaux", event: "Reopened the proposal · 3rd visit", type: "open" },
      { when: "Yesterday · 4:02 PM", who: "Curtis Pelletier", event: "Opened from a forwarded link", detail: "New viewer", type: "viewer" },
      { when: "Yesterday · 3:48 PM", who: "Linette Boudreaux", event: "Spent 6m on Pricing tiers", type: "read" },
      { when: "May 19 · 10:11 AM", who: "Dana Whitfield", event: "Opened the proposal", type: "open" },
      { when: "May 18 · 7:14 PM", who: "Linette Boudreaux", event: "First opened · read to 98%", type: "first" },
    ],
  },
  "OAK-2026-LA61": {
    heat: "warm", opens: 4, lastOpened: "1d ago", firstOpened: "May 20 · 9:30 AM",
    sentOn: "May 20", readTime: "4m 05s", scrollDepth: 64, expires: "Jun 11", daysLeft: 20, linkLife: 30,
    viewers: [
      { initials: "RO", name: "Renata Olivier", role: "Treasurer", opens: 3, lastSeen: "1d ago" },
      { initials: "TM", name: "Theo Marchand", role: "Board President", opens: 1, lastSeen: "2d ago" },
    ],
    sections: [
      { name: "Cover & intro", pct: 100, status: "read" },
      { name: "Unresponsive current manager", pct: 100, status: "read" },
      { name: "Financials are opaque", pct: 90, status: "read" },
      { name: "Reserve planning is unclear", pct: 55, status: "skimmed" },
      { name: "How this was built", pct: 0, status: "skipped" },
      { name: "Pricing tiers", pct: 85, status: "read", note: "Returned here twice" },
      { name: "Your team", pct: 10, status: "skipped" },
      { name: "First 90 days", pct: 0, status: "skipped" },
      { name: "Discovery call CTA", pct: 30, status: "skimmed" },
    ],
    feed: [
      { when: "1d ago", who: "Renata Olivier", event: "Reopened · jumped straight to Pricing tiers", type: "read" },
      { when: "May 20 · 2:40 PM", who: "Theo Marchand", event: "Opened briefly", detail: "New viewer", type: "viewer" },
      { when: "May 20 · 9:30 AM", who: "Renata Olivier", event: "First opened · read to 64%", type: "first" },
    ],
  },
  // Seabrook Pointe (SEA-2026-MS22) intentionally has NO mock WATCH → it shows a
  // clean ZERO state ("Not opened yet") until a real board open lands. It's the
  // live-telemetry TEST board: open its board page, scroll, reload Close → watch
  // it go from 0 to real engagement.
};

// Zero-state for a proposal just sent in-session (no opens yet). Sections derive
// from the lead's matched concerns.
export function freshWatch(lead) {
  return {
    heat: "new", opens: 0, lastOpened: "Not opened yet", firstOpened: null,
    sentOn: "Just now", readTime: "—", scrollDepth: 0, expires: "in 30 days", daysLeft: 30, linkLife: 30,
    viewers: [],
    sections: (lead.concerns || []).map((c) => ({ name: c.label, pct: 0, status: "unseen" })),
    feed: [{ when: "Just now", who: "You", event: "Proposal sent · awaiting first open", detail: lead.email, type: "first" }],
  };
}

const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Close telemetry aggregation (real board events → WATCH shape) ----------
// The board doc emits open/section/heartbeat/cta events (board-proposal.jsx) to
// the proposal-track edge fn → proposal_events. loadData groups them per proposal
// and hands them here; this rolls them up into the exact shape CloseView renders,
// so Close shows REAL engagement. Falls back to mock WATCH when there are none.
const SECTION_ORDER = ["Cover & intro", "Concerns", "How this was built", "Pricing tiers", "Your team", "First 90 days", "Discovery call CTA"];
const initialsOf = (name) => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const relTime = (iso) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDateTime = (iso) => `${fmtDate(iso)} · ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
const fmtDuration = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };

export function aggregateWatch(events, lead) {
  if (!events || !events.length) return null;
  const sorted = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const opens = sorted.filter((e) => e.event_type === "open");

  // Viewers — distinct device, named or "Board member #N" in first-seen order.
  const byViewer = new Map();
  sorted.forEach((e) => {
    if (!byViewer.has(e.viewer_key)) byViewer.set(e.viewer_key, { name: "", opens: 0, last: e.created_at });
    const v = byViewer.get(e.viewer_key);
    if (e.viewer_name) v.name = e.viewer_name;
    if (e.event_type === "open") v.opens += 1;
    v.last = e.created_at;
  });
  let anonN = 0;
  const viewers = [...byViewer.values()].map((v) => {
    const name = v.name || `Board member #${++anonN}`;
    return { initials: initialsOf(name), name, role: "", opens: v.opens, lastSeen: relTime(v.last) };
  });

  // Sections — deepest read pct per section, in document order.
  const secMax = new Map();
  sorted.forEach((e) => { if (e.event_type === "section" && e.section_name) secMax.set(e.section_name, Math.max(secMax.get(e.section_name) || 0, e.pct || 0)); });
  const names = [...SECTION_ORDER, ...[...secMax.keys()].filter((n) => !SECTION_ORDER.includes(n))];
  const sections = names.filter((n) => secMax.has(n)).map((name) => {
    const pct = secMax.get(name) || 0;
    return { name, pct, status: pct >= 80 ? "read" : pct >= 25 ? "skimmed" : "skipped" };
  });

  const scrollDepth = Math.max(0, ...[...secMax.values()], 0);
  const maxMs = Math.max(0, ...sorted.map((e) => e.ms || 0));
  const last = sorted[sorted.length - 1];
  const recentDays = (Date.now() - new Date(last.created_at).getTime()) / 86400000;
  let heat = "new";
  if (opens.length) heat = (opens.length >= 3 && recentDays < 2 && scrollDepth >= 75) ? "hot"
    : (recentDays > 5 || (opens.length <= 1 && scrollDepth < 40)) ? "cold" : "warm";

  const sentAt = lead.sentAt || (opens[0] && opens[0].created_at) || null;
  const linkLife = 30;
  const expiresAt = sentAt ? new Date(new Date(sentAt).getTime() + linkLife * 86400000) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : 0;

  const feed = [...sorted].reverse().filter((e) => e.event_type === "open" || e.event_type === "cta" || (e.event_type === "section" && e.pct >= 80))
    .slice(0, 7).map((e) => ({
      when: relTime(e.created_at),
      who: e.viewer_name || "Board member",
      // cta labels (board responses) are self-descriptive — show them verbatim.
      event: e.event_type === "cta" ? e.section_name : e.event_type === "section" ? `Read ${e.section_name} to ${e.pct}%` : "Opened the proposal",
      type: e.event_type === "cta" ? "cta" : e.event_type === "section" ? "read" : "open",
    }));

  // The board's latest explicit VERDICT (continue / changes / decline), pulled
  // from the cta events' meta — surfaced prominently in Close so staff act on it.
  // 'question' events are voice, not a verdict → excluded here (they still show
  // in the feed above).
  const VERDICT_ACTIONS = ["continue", "changes", "decline"];
  const responses = sorted.filter((e) => e.event_type === "cta" && e.meta && VERDICT_ACTIONS.includes(e.meta.action));
  const r = responses[responses.length - 1];
  const response = r ? { action: r.meta.action, label: r.section_name, meta: r.meta, when: relTime(r.created_at) } : null;

  return {
    heat, opens: opens.length, response,
    lastOpened: relTime(last.created_at),
    firstOpened: opens.length ? fmtDateTime(opens[0].created_at) : null,
    sentOn: sentAt ? fmtDate(sentAt) : "—",
    readTime: maxMs ? fmtDuration(maxMs) : "—",
    scrollDepth,
    expires: expiresAt ? fmtDate(expiresAt) : "—", daysLeft, linkLife,
    viewers, sections, feed,
  };
}

// Enrich one raw submission into the full pipeline shape: run the matching
// engine (or a baked LLM match) + attach Close telemetry + build the section
// checklist + pricing-friendly fields. ONE path for both the mock pipeline and
// DB-loaded proposals (loadData calls this), so they render identically.
export function enrichLead(s) {
  // Prefer a baked LLM match (run scripts/llm-precompute-matches.mjs) when present;
  // otherwise the deterministic tag engine. Either way the shape is identical, so
  // the screen is matcher-agnostic. `_source` lets the UI show which ran.
  // Match precedence: a persisted LLM snapshot (real lead, matched once at
  // intake) > a baked demo LLM match > the deterministic tag engine fallback.
  const m = s.matchSnapshot || LLM_MATCHES[s.id] || { ...deriveLeadMatch(s.selectedPains, PAIN_POINTS, UVPS, { prose: PAIN_PROSE, topCaps: 4 }), _source: "engine" };
  const tierName = "Full-Service Management";
  const quoteValue = s.quoteValue != null ? s.quoteValue : Math.round((s.perHome || 0) * (s.homes || 0) * 12);
  const first = s.received ? s.received.split(" · ")[0] : "intake";
  return {
    ...s,
    tierName,
    quoteValue,
    ...m, // match, concerns, scores, links, capsMatched, capsTotal
    // Close engagement: real aggregated board events when present, else the mock
    // WATCH (demo boards without live telemetry yet).
    watch: (s.events && s.events.length) ? aggregateWatch(s.events, s) : (WATCH[s.id] || null),
    includes: INCLUDES,
    sections: buildSections(m.concerns), // Build checklist skeleton
    gapNote: "There's almost always a small gap worth aligning on — let's talk it through on the discovery call before you sign anything.",
    tagline: `Built around the ${m.concerns.length} concerns ${s.firstName} raised on ${first}.`,
  };
}

export const LEADS = LEADS_RAW.map(enrichLead);

// The pipeline the cockpit + board page render: live proposals from Supabase
// (DATA.proposals, enriched in loadData) when configured + present, else the
// mock pipeline above. Lets local mock dev keep working unchanged.
export function getLeads() {
  return (DATA.proposals && DATA.proposals.length) ? DATA.proposals : LEADS;
}

// pricing helper (per lead, honoring a per-home override)
export function pricing(lead, perHomeOverride) {
  const perHome = perHomeOverride != null ? perHomeOverride : lead.perHome;
  const monthly = perHome * lead.homes;
  return { perHome: fmt(perHome), monthly: fmt(monthly), annual: fmt(monthly * 12), monthlyNum: monthly };
}
