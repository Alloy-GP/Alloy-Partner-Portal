// The growth flywheel: the share of demand that comes back through *reputation*
// — brand/direct, reviews (GBP), referrals, AI-search authority — versus earned
// or paid Reach. A rising share means the Retain → Reach loop is compounding,
// which is the program's "continued growth" story.
//
// Phase 1: inferred from the lead source mix (wc_qualified_by_source). It sharpens
// when explicit review/referral counts get tracked. Edit the lists below to tune.

// The reputation LOOP — demand that comes back through brand, reviews, and
// word-of-mouth. NOT organic search (that's earned Reach, counted at the top of
// the funnel) and NOT paid directories like hoamanagement.com / hoa-usa.com
// (those are paid placements — acquisition cost, not the loop).
const FED_EXACT = ["(direct)", "direct", "gbp", "gmb"];
const FED_SUBSTR = ["chatgpt", "perplexity", "gemini", "copilot", "claude", "referral", "word of mouth", "wom"];

function isFedSource(name) {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return false;
  if (FED_EXACT.includes(k)) return true;
  return FED_SUBSTR.some((s) => k.includes(s));
}

// { total, fed, earned, strengthPct } from a { source: count } map.
export function flywheelStats(sourceMap) {
  let fed = 0, total = 0;
  for (const [src, n] of Object.entries(sourceMap || {})) {
    const c = Number(n) || 0;
    total += c;
    if (isFedSource(src)) fed += c;
  }
  return { total, fed, earned: total - fed, strengthPct: total ? Math.round((fed / total) * 100) : 0 };
}

// Build a { source: count } map from a leads array (fallback when the account
// rollup map is empty), counting qualified leads by source.
export function sourceMapFromLeads(leads) {
  const m = {};
  (leads || []).forEach((l) => {
    if (l.quotable === "yes") { const s = l.source || "unknown"; m[s] = (m[s] || 0) + 1; }
  });
  return m;
}

// Quarter-over-quarter trend per flywheel stage. Compares the same elapsed window
// of the current quarter against the prior quarter (apples-to-apples for a partial
// quarter — e.g. "first 74 days of this qtr vs first 74 of last").
//   reach  = all leads   match = qualified   retain = qualified & reputation-fed
export function quarterTrends(leads, nowMs) {
  const now = new Date(nowMs);
  const qFirstMonth = Math.floor(now.getMonth() / 3) * 3;
  const qStart = new Date(now.getFullYear(), qFirstMonth, 1).getTime();
  const elapsed = nowMs - qStart;
  const priorStart = new Date(now.getFullYear(), qFirstMonth - 3, 1).getTime();
  const priorEnd = priorStart + elapsed;
  const within = (d, a, b) => { const t = new Date(d).getTime(); return t >= a && t <= b; };
  const cur = (leads || []).filter((l) => l.date && within(l.date, qStart, nowMs));
  const prior = (leads || []).filter((l) => l.date && within(l.date, priorStart, priorEnd));
  const count = (arr, kind) =>
    kind === "reach" ? arr.length
    : kind === "match" ? arr.filter((l) => l.quotable === "yes").length
    : arr.filter((l) => l.quotable === "yes" && isFedSource(l.source)).length;
  const row = (kind) => {
    const c = count(cur, kind), p = count(prior, kind);
    const deltaPct = p ? Math.round(((c - p) / p) * 100) : (c ? null : 0); // null = no baseline ("new")
    return { cur: c, prev: p, deltaPct, dir: c > p ? "up" : c < p ? "down" : "flat" };
  };
  return { hasPrior: prior.length > 0, reach: row("reach"), match: row("match"), retain: row("retain") };
}
