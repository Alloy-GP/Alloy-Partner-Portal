// ============================================================================
// Intake mapping — a real WhatConverts lead → the proposal's raw shape.
//
// The CMGT staging form (→ WhatConverts → leads table) submits the board's
// intake. This turns one of those leads into the `proposals` row shape so the
// matcher can run on it exactly like the seeded demo boards.
//
// Frustrations come through as a comma-joined string of the form's labels — and
// those labels CONTAIN commas, so we never split on commas. Instead each canon
// pain is detected by a DISTINCTIVE keyword/regex, which is robust to wording
// drift between the form labels and our canonical PAIN_POINTS labels.
// ============================================================================
import { PAIN_POINTS } from "./proposalMockData.js";

// pain id → distinctive matcher against the (normalized) frustrations text.
const PAIN_KEYWORDS = {
  communication: /communication/,
  delinquency: /delinquency|collections/,
  "manager-turnover": /manager turnover/,
  transparency: /financial opacity|opacity|own books/,
  reactive: /reactive/,
  switching: /switching providers|worried about disruption/,
  volunteer: /volunteer|burning out|board is burning/,
  compliance: /compliance|fair housing|fiduciary/,
  tech: /tech is dated|no real portal|dated.*(portal|app)/,
  "homeowner-apathy": /homeowner apathy|apathy/,
  "vendor-issues": /vendor/,
  "gulf-south": /gulf south/,
  developer: /developer/,
};
const KNOWN_PAIN_IDS = new Set(PAIN_POINTS.map((p) => p.id));

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’`]/g, "'").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();

// Frustrations string → array of canonical pain ids (in PAIN_POINTS order).
export function painsFromFrustrations(frustrations) {
  const hay = norm(frustrations);
  if (!hay) return [];
  return PAIN_POINTS.filter((p) => {
    const kw = PAIN_KEYWORDS[p.id];
    return kw && KNOWN_PAIN_IDS.has(p.id) && kw.test(hay);
  }).map((p) => p.id);
}

// A WhatConverts lead (DATA.recentLeads shape: id/name/email/phone/company +
// fields[{name,value}]) → the raw proposal shape (proposalMockData LEADS_RAW).
export function leadToProposalRaw(lead) {
  const f = {};
  (lead.fields || []).forEach((x) => { f[norm(x.name).replace(/\*$/, "").trim()] = x.value; });
  const get = (...keys) => { for (const k of keys) { if (f[norm(k)]) return f[norm(k)]; } return ""; };
  const units = parseInt(String(get("number of units")).replace(/[^0-9]/g, ""), 10) || 0;
  const duesRaw = get("monthly dues / unit", "monthly dues");
  return {
    id: lead.id, // wc_lead_id — becomes the proposal lead_key
    community: lead.company || get("association name", "community / association name") || lead.name || "New community",
    contact: lead.name || get("your name", "name") || "",
    contactRole: get("role", "your role") || "",
    firstName: (lead.name || get("your name", "name") || "").split(" ")[0] || "there",
    email: lead.email || get("email") || "",
    phone: lead.phone || get("phone") || "",
    city: get("location") || "",
    homes: units,
    metaType: get("community type") || "",
    metaStatus: get("current management status") || "",
    dues: duesRaw ? `$${String(duesRaw).replace(/[^0-9.]/g, "")} / unit monthly` : "",
    engageTimeline: get("engagement timeline") || "",
    budget: get("budget range", "budget") || "",
    selectedPains: painsFromFrustrations(get("frustrations")),
    quote: get("in your own words - what does success look like?", "in your own words", "anything you'd like us to know? (optional)") || lead.message || "",
    received: lead.date ? new Date(lead.date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "",
    status: "new",
    owner: "",
    perHome: 8.98, // default Full-Service rate; staff adjusts in Build
    services: get("services needed"),
    amenities: get("amenities"),
  };
}
