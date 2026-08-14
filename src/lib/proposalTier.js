// ============================================================================
// Which tier the intake form actually points at, and what it contradicts.
//
// The form asks the board a budget question, a management-status question, a unit
// count and which services they want — and none of it reached the recommendation.
// perHome was hardcoded to 8.98 (the Full-Service rate) in proposalIntake, tier_id
// to 'full' in mintLead, and tierName to "Full-Service Management" in enrichLead.
// So a board that ticked "Tight budget — financial only" was quoted Full-Service.
//
// MATCHED AGAINST THE REAL FORM VOCABULARY, read off the live leads table rather
// than guessed:
//   Budget range              Open — looking for the right fit, not the cheapest
//                             Cost-sensitive — need a lean option
//                             Tight budget — financial only
//   Current management status Self-managed by board
//                             Looking to switch from current provider
//                             New construction / developer-controlled
//                             Other
//   Community type            Single-family | Condos
//   Engagement timeline       Immediately | Within 60 days | Engage by Q4 2026 | Just exploring
//   Services needed           multi-select: Full financial management, Vendor
//                             coordination, Compliance & insurance, Board meeting
//                             support, Resident communication, Collections /
//                             delinquency, Reserve planning
//   Number of units           free text — real submissions include "NA" and "1"
//
// This module OWNS the tier catalog (proposalMockData re-exports TIERS from here)
// so there is no import cycle: nothing here imports from proposalMockData.
//
// It recommends and explains; it never prices unilaterally. Staff can override the
// rate in Build, and every recommendation carries a `why` so the number on screen
// is never unattributable.
// ============================================================================

// The canonical tiers. rate/range figures are CMGT's published ones.
export const TIERS = [
  { id: 'full', name: 'Full-Service Management', recommended: true, rateRange: '$4.50 – $25.00', defaultRate: 8.98, setupFee: 0 },
  { id: 'financial', name: 'Financial & Administrative', rateRange: '$2.00 – $10.00', defaultRate: 4.0, setupFee: 0 },
  { id: 'onsite', name: 'On-Site Management', rateRange: '≈ $2,500 / month', defaultRate: null, setupFee: 0 },
];

export const tierById = (id) => TIERS.find((t) => t.id === id) || TIERS[0];
export const tierName = (id) => tierById(id).name;

const norm = (s) => String(s || '').toLowerCase().replace(/[‘’`]/g, "'").replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Budget intent. Three real options, two of which mean "not full service".
// ---------------------------------------------------------------------------
export function budgetIntent(budget) {
  const b = norm(budget);
  if (!b) return 'unstated';
  if (/financial only|financial-only/.test(b)) return 'financial-only';   // "Tight budget - financial only"
  if (/cost-sensitive|lean option|\blean\b|tight budget/.test(b)) return 'lean'; // "Cost-sensitive - need a lean option"
  if (/right fit|not the cheapest|\bopen\b/.test(b)) return 'open';       // "Open - looking for the right fit"
  return 'unstated';
}

// On-site is defined by scale: TIERS calls it "For 500+ home communities and
// high-rises", and it is a flat monthly fee, not per-home.
const ONSITE_MIN_HOMES = 500;
// Below this, per-home pricing produces numbers no one would actually contract
// (12 homes x $8.98 = $107.76/mo).
export const PER_HOME_IMPLAUSIBLE_BELOW = 25;

// ---------------------------------------------------------------------------
// MINIMUM MONTHLY FEE — ***PROVISIONAL. NOT CONFIRMED BY CMGT.***
//
// The real floor has to come from the client. These are placeholders so the
// portal stops showing $48/mo, and they are DERIVED from CMGT's own published
// rates rather than invented from nothing: the floor for a tier is what that
// tier costs at PER_HOME_IMPLAUSIBLE_BELOW units, rounded to something a human
// would say out loud. That gives the correct semantic for a minimum — no
// community pays less than a 25-unit one.
//
//   full       25 x $8.98 = $224.50  ->  $250
//   financial  25 x $4.00 = $100.00  ->  $100
//   onsite     already a flat $2,500 (TIERS rateRange), so it is its own floor
//
// MINIMUM_IS_PROVISIONAL travels with every priced figure so no surface can show
// one of these numbers as though it were agreed. When the real floor arrives:
// change the values here, set MINIMUM_IS_PROVISIONAL = false, done.
// ---------------------------------------------------------------------------
export const MINIMUM_IS_PROVISIONAL = true;
export const TIER_MIN_MONTHLY = { full: 250, financial: 100, onsite: 2500 };
export const tierMinMonthly = (tierId) => TIER_MIN_MONTHLY[tierId] ?? TIER_MIN_MONTHLY.full;

// The ONE place a monthly figure is computed. Returns the number to show plus
// everything a caller needs to be honest about it:
//   monthly     what to charge/show (floored)
//   raw         the unfloored per-home math, for "would have been" copy
//   floored     true when the minimum did the work
//   minimum     which floor applied
//   provisional true when that floor is a placeholder, not client-confirmed
//   effectivePerHome  monthly/homes — what the floor implies per door
export function monthlyFor({ tierId = 'full', perHome = 0, homes = 0 } = {}) {
  const id = TIER_MIN_MONTHLY[tierId] != null ? tierId : 'full';
  const n = Number(homes) || 0;
  const rate = Number(perHome) || 0;
  const minimum = tierMinMonthly(id);
  // On-site is a flat fee, not per-home: the "minimum" IS the price.
  const raw = id === 'onsite' ? minimum : rate * n;
  const monthly = Math.max(raw, minimum);
  const floored = monthly > raw + 1e-9;
  return {
    monthly,
    raw,
    floored,
    minimum,
    provisional: floored && MINIMUM_IS_PROVISIONAL,
    effectivePerHome: n > 0 ? monthly / n : null,
    tierId: id,
  };
}

export function isHighRise(metaType) {
  return /high.?rise|tower|mid.?rise/.test(norm(metaType));
}

// ---------------------------------------------------------------------------
// The recommendation. Returns the tier, the starting rate, and WHY — the `why`
// is rendered next to the price so the number is always attributable.
// ---------------------------------------------------------------------------
export function recommendTier(raw = {}) {
  const homes = Number(raw.homes) || 0;
  const intent = budgetIntent(raw.budget);
  const status = norm(raw.metaStatus);
  const highRise = isHighRise(raw.metaType);

  let tierId = 'full';
  let why = 'Default for a board that wants the work taken off their plate.';

  // Scale wins: on-site is a staffing model, not a preference.
  if (homes >= ONSITE_MIN_HOMES || highRise) {
    tierId = 'onsite';
    why = highRise && homes < ONSITE_MIN_HOMES
      ? 'High-rise / mid-rise — on-site management is the model for vertical communities.'
      : `${homes.toLocaleString()} homes — on-site management is the model at ${ONSITE_MIN_HOMES}+.`;
  } else if (intent === 'financial-only') {
    tierId = 'financial';
    why = 'They asked for financial-only management on the intake form.';
  } else if (intent === 'lean') {
    tierId = 'financial';
    why = 'They told us the budget is cost-sensitive and asked for a lean option.';
  } else if (intent === 'open') {
    why = 'They said they are open to the right fit rather than the cheapest.';
  } else if (/developer|new construction/.test(status)) {
    why = 'Developer-controlled setup — full service through homeowner turnover.';
  }

  const tier = tierById(tierId);
  return {
    tierId,
    tierName: tier.name,
    perHome: tier.defaultRate,          // null for on-site (flat fee)
    flatMonthly: tierId === 'onsite' ? 2500 : null,
    rateRange: tier.rateRange,
    budgetIntent: intent,
    why,
  };
}

// ---------------------------------------------------------------------------
// What the form contradicts or leaves unusable. Surfaced to staff BEFORE a
// proposal goes out, because the alternative is a confident document built on a
// contradiction the board itself submitted.
//
// Real example that prompted this: Chappell Creek LOA ticked the frustration
// "Developer-controlled community needing professional setup" while answering
// "Self-managed by board", with 12 units. The matcher was right — it reflected
// the form — but nothing asked which of the two was true.
// ---------------------------------------------------------------------------
export function intakeFlags(raw = {}) {
  const flags = [];
  const pains = raw.selectedPains || [];
  const status = norm(raw.metaStatus);
  const homes = Number(raw.homes) || 0;
  const intent = budgetIntent(raw.budget);

  const saysDeveloper = /developer|new construction/.test(status);
  if (pains.includes('developer') && status && !saysDeveloper) {
    flags.push({
      code: 'developer-vs-status',
      label: 'Developer-controlled, but they say they are not',
      detail: `They ticked the developer-controlled frustration while answering "${raw.metaStatus}". Ask which it is — the proposal's whole transition story depends on it.`,
    });
  }
  if (pains.includes('switching') && /self-managed/.test(status)) {
    flags.push({
      code: 'switching-vs-selfmanaged',
      label: 'Switching providers, but self-managed',
      detail: `They ticked the switching-providers frustration while answering "${raw.metaStatus}". There may be no incumbent to transition from.`,
    });
  }
  if (!homes) {
    flags.push({
      code: 'no-unit-count',
      label: 'No usable unit count',
      detail: 'The unit count is missing or not a number, so per-home pricing cannot be computed. Confirm the door count before quoting.',
    });
  } else if (homes < PER_HOME_IMPLAUSIBLE_BELOW) {
    const m = monthlyFor({ tierId: raw.tierId || 'full', perHome: raw.perHome, homes });
    flags.push({
      code: 'tiny-community',
      label: `Only ${homes} ${homes === 1 ? 'unit' : 'units'} — minimum fee applied`,
      detail: m.floored
        ? `Per-home pricing gives $${m.raw.toFixed(2)}/mo at this size, so the $${m.minimum}/mo minimum applies instead. That minimum is a PLACEHOLDER — confirm the real one with CMGT before this goes to a board.`
        : `Small community — check the per-home rate is right at this size.`,
    });
  }
  if ((intent === 'financial-only' || intent === 'lean') && raw.tierId === 'full') {
    flags.push({
      code: 'tier-vs-budget',
      label: 'Full service against a lean budget',
      detail: `They said "${raw.budget}" but this is set to Full-Service. Deliberate is fine — just make sure the price conversation happens.`,
    });
  }
  if (!String(raw.budget || '').trim()) {
    flags.push({
      code: 'no-budget',
      label: 'No budget answer',
      detail: 'Nothing to anchor the tier recommendation to, so it defaults to Full-Service.',
    });
  }
  return flags;
}
