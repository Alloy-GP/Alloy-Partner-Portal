// Shared, dependency-free proposal logic used by BOTH the portal (src/lib/
// proposalPlans.js re-exports it) and the engagement-proposal edge function.
// Living here (inside the function folder) is what lets the function bundle it;
// the portal imports it by relative path. Plain ESM, no Deno/browser APIs.
//
//   plans      — the 1–3 investment plans on a proposal, normalised + selected
//   money/term — one formatting, so the page, the emails and the CONTRACT agree
//   agreement  — the exact document (facts + full text) for a plan + signer,
//                which is what gets snapshotted and hashed at acceptance
import { buildAgreement } from "./agreementTerms.js";

export const ALLOY_LEGAL = {
  name: "Alloy Growth Partners, LLC",
  short: "Alloy Growth Partners",
  brand: "Alloy Growth Partners",
  city: "Austin, TX",
  signer: "Skyler Nelson, Partner",
};

export const PLAN_KEYS_MAX = 3;

export function fmtUSD(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 ? 2 : 0 });
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four"];
// "twelve (12) months" — the contract's phrasing.
export function termWords(months) {
  const m = Math.max(1, Math.floor(Number(months) || 12));
  const w = m < ONES.length ? ONES[m] : (m === 36 ? "thirty-six" : String(m));
  return `${w} (${m}) month${m === 1 ? "" : "s"}`;
}

// "November 1, 2026" from an ISO date (YYYY-MM-DD) or timestamp. UTC so a
// date-only value never shifts a day.
export function longDate(iso) {
  if (!iso) return "";
  const s = String(iso);
  const d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function slugKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "plan";
}

// Sanitise whatever is stored: at most 3 plans, numbers as numbers, unique
// keys, exactly one recommended (the first if none was marked).
export function normalizePlans(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;
    const name = String(p.name || "").trim();
    if (!name) continue;
    let key = slugKey(p.key || name);
    while (seen.has(key)) key += "-2";
    seen.add(key);
    out.push({
      key, name,
      tagline: String(p.tagline || "").trim(),
      monthly: Math.max(0, Number(p.monthly) || 0),
      setup: Math.max(0, Number(p.setup) || 0),
      locations: Math.max(1, Math.floor(Number(p.locations) || 1)),
      termMonths: Math.max(1, Math.floor(Number(p.termMonths) || 12)),
      guarantee: !!p.guarantee,
      exclusive: !!p.exclusive,
      referralDiscount: Math.max(0, Number(p.referralDiscount) || 0),
      // v3: match HOA preferred-partner status, portal access, and the "Fuel"
      // bar (0–100; null = derive from price in the UI).
      matchHoa: !!p.matchHoa,
      portal: p.portal !== false,
      fuel: Number.isFinite(Number(p.fuel)) && p.fuel !== "" && p.fuel !== null ? Math.max(0, Math.min(100, Math.round(Number(p.fuel)))) : null,
      recommended: !!p.recommended,
      show: p.show !== false,
    });
    if (out.length >= PLAN_KEYS_MAX) break;
  }
  // Exactly one recommended, and it must be a SHOWN plan.
  const shown = out.filter((p) => p.show);
  const rec = shown.filter((p) => p.recommended);
  if (out.length) out.forEach((p) => { p.recommended = false; });
  if (shown.length) (rec[0] || shown[0]).recommended = true;
  return out;
}

// Only plans the client can see take part in selection.
export function visiblePlans(plans) { return (Array.isArray(plans) ? plans : []).filter((p) => p && p.show !== false); }
export function pickPlan(plans, key) {
  const list = visiblePlans(plans);
  return list.find((p) => p.key === key) || list.find((p) => p.recommended) || list[0] || null;
}

export const dueAtStart = (plan) => (plan ? (Number(plan.monthly) || 0) + (Number(plan.setup) || 0) : 0);
export const planLocLabel = (plan) => plan ? `${plan.locations} ${plan.locations === 1 ? "location" : "locations"}` : "";

// Which named markets a plan covers: the account's locations, capped at the
// plan's count; anything beyond the named ones is "to be named".
export function marketsFor(names, plan) {
  const list = (Array.isArray(names) ? names : []).map((n) => (n && typeof n === "object" ? n.name : n)).filter(Boolean);
  const n = plan ? plan.locations : list.length;
  const named = list.slice(0, n);
  return { named, unnamed: Math.max(0, n - named.length) };
}

// The service agreement for THIS proposal + plan + signer, as facts and as the
// full text. Snapshotted verbatim at acceptance. `input`:
//   { ref, clientLegalName, clientEntityType, clientAddress, effectiveDate,
//     plan, markets: string[], signerName, signerTitle, spoc, exclusivityMiles }
//   spoc = the point of contact named before acceptance; the signer replaces it.
export const DEFAULT_EXCLUSIVITY_MILES = 16;

export function agreementDocument(input) {
  const i = input || {};
  const miles = Math.max(1, Math.floor(Number(i.exclusivityMiles) || DEFAULT_EXCLUSIVITY_MILES));
  const plan = i.plan || { name: "Growth plan", monthly: 0, setup: 0, locations: 1, termMonths: 12, guarantee: false, exclusive: false };
  const legalName = String(i.clientLegalName || "").trim() || "[Client legal name]";
  const signer = String(i.signerName || "").trim()
    ? `${String(i.signerName).trim()}${String(i.signerTitle || "").trim() ? `, ${String(i.signerTitle).trim()}` : ""}`
    : "Authorized signer";
  const effective = longDate(i.effectiveDate) || "[effective date]";
  const term = termWords(plan.termMonths);
  const markets = Array.isArray(i.markets) ? i.markets.filter(Boolean) : [];
  const marketsLabel = markets.length === plan.locations
    ? markets.join(" · ")
    : `${planLocLabel(plan)}${markets.length ? ` (${markets.join(" · ")}${plan.locations > markets.length ? `, ${plan.locations - markets.length} to be named` : ""})` : " (to be named)"}`;
  const facts = [
    { k: "Client", v: legalName },
    { k: "Plan", v: `${plan.name} · ${planLocLabel(plan)}` },
    { k: "Markets", v: marketsLabel },
    { k: "Monthly investment", v: `${fmtUSD(plan.monthly)} / month` },
    { k: "One-time setup", v: fmtUSD(plan.setup) },
    { k: "Term", v: `${plan.termMonths} months, from ${effective}` },
    { k: "Billing", v: "ACH autopay, 1st of each month" },
    { k: "Growth Guarantee", v: plan.guarantee ? "Included (Sec. 8.8)" : "Not included" },
    { k: "Market exclusivity", v: plan.exclusive ? `Included, each market · ${miles}-mile radius (Sec. 3.2)` : "Not included" },
    { k: "Alloy", v: `${ALLOY_LEGAL.name}, ${ALLOY_LEGAL.city}` },
  ];
  const built = buildAgreement({
    clientName: legalName,
    clientEntity: String(i.clientEntityType || "").trim() || "[entity type, e.g. Louisiana limited liability company]",
    clientAddress: String(i.clientAddress || "").trim() || "[client principal place of business]",
    effective,
    track: plan.name,
    monthly: `${fmtUSD(plan.monthly)} per month`,
    setup: fmtUSD(plan.setup),
    termMonths: term,
    guarantee: !!plan.guarantee,
    miles,
    spoc: String(i.signerName || "").trim() ? signer : (String(i.spoc || "").trim() || "[Client point of contact]"),
  });
  const base = {
    ref: String(i.ref || ""), legalName, effective, signer, alloySigner: ALLOY_LEGAL.signer, exclusivityMiles: miles,
    plan: { key: plan.key, name: plan.name, monthly: plan.monthly, setup: plan.setup, locations: plan.locations, termMonths: plan.termMonths, guarantee: !!plan.guarantee, exclusive: !!plan.exclusive },
    facts, preamble: built.preamble, sections: built.sections, closing: built.closing,
  };
  return { ...base, text: agreementText(base) };
}

// One canonical plain-text rendering — what gets hashed. Deterministic.
export function agreementText(doc) {
  const lines = [
    `${ALLOY_LEGAL.short.toUpperCase()} & ${doc.legalName.toUpperCase()} SERVICE AGREEMENT`,
    doc.ref ? `Agreement ${doc.ref}` : "",
    `Effective ${doc.effective}`,
    "",
    ...doc.facts.map((f) => `${f.k}: ${f.v}`),
    "",
    doc.preamble,
    "",
  ];
  for (const s of doc.sections || []) {
    lines.push(`${s.n}. ${s.title}${s.body ? ` ${s.body}` : ""}`);
    for (const ss of s.subs || []) lines.push(`  ${ss.n} ${ss.title} ${ss.body}`);
    lines.push("");
  }
  lines.push(doc.closing, "", `For ${doc.legalName}: ${doc.signer}`, `For ${ALLOY_LEGAL.name}: ${ALLOY_LEGAL.signer}`);
  return lines.filter((l) => l !== undefined && l !== null).join("\n");
}
