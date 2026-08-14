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
// (12 homes x $8.98 = $107.76/mo). Not a price — a prompt for staff to set one.
const PER_HOME_IMPLAUSIBLE_BELOW = 25;

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
    flags.push({
      code: 'tiny-community',
      label: `Only ${homes} ${homes === 1 ? 'unit' : 'units'}`,
      detail: `Per-home pricing gives a monthly figure no one would contract at this size. Set a flat minimum rather than sending the per-home math.`,
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
