// ============================================================================
// Proposal plans, comparison grid, ROI, validity — pure logic for the redesigned
// proposal page and its Admin authoring. The parts the edge function also needs
// (plan normalisation, money, the agreement document) live in
// supabase/functions/engagement-proposal/proposalShared.js and are re-exported
// here so there is exactly one implementation. Tested in proposalPlans.test.js.
// ============================================================================
export {
  ALLOY_LEGAL, fmtUSD, termWords, longDate, slugKey, normalizePlans, pickPlan, visiblePlans,
  dueAtStart, planLocLabel, marketsFor, agreementDocument, agreementText,
} from '../../supabase/functions/engagement-proposal/proposalShared.js';
import { normalizePlans as _normalizePlans, fmtUSD as _fmtUSD, planLocLabel as _planLocLabel } from '../../supabase/functions/engagement-proposal/proposalShared.js';

// Prefill for a new proposal — staff edit from here. Prices are the current
// standard tiers; locations default from the account where it has them.
export const PLAN_TEMPLATES = [
  { key: 'core', name: 'Core', tagline: 'One market', monthly: 3200, setup: 2500, locations: 1, termMonths: 12, guarantee: false, exclusive: false, referralDiscount: 150, recommended: false },
  { key: 'growth', name: 'Growth', tagline: 'Three markets', monthly: 6850, setup: 2500, locations: 3, termMonths: 12, guarantee: true, exclusive: true, referralDiscount: 150, recommended: true },
  { key: 'scale', name: 'Scale', tagline: 'Five markets', monthly: 9400, setup: 2500, locations: 5, termMonths: 12, guarantee: true, exclusive: true, referralDiscount: 150, recommended: false },
];
export const DEFAULT_EXCLUSIVITY_MILES = 16;
export const DEFAULT_ROI = { feePerDoor: 14, doorsPerCommunity: 150 };
export const DEFAULT_TESTIMONIAL = { vimeoId: '1131397045', caption: 'Client testimonial · 2:58' };
export const VALIDITY_DAYS = 30;

// The six page sections. `sections` jsonb on the row is {key: bool}; missing = shown.
export const SECTION_DEFS = [
  { key: 's1', n: '01', label: 'The plan in one view', note: 'Intro paragraph + 3 stat tiles' },
  { key: 's2', n: '02', label: 'We know CAM', note: '35 years · 10 expertise tiles' },
  { key: 's3', n: '03', label: 'What you get', note: '4 outcome cards from the modules' },
  { key: 's4', n: '04', label: 'How we do it', note: '5 topic tiles with peek modals' },
  { key: 's5', n: '05', label: 'Investment & guarantee', note: 'Plan comparison + seal' },
  { key: 's6', n: '06', label: 'Next steps', note: '4-step timeline + CTA' },
];
export const OUTCOME_TOGGLE_KEYS = ['o-reach', 'o-match', 'o-retain', 'o-core'];
export function normalizeSections(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries([...SECTION_DEFS.map((s) => s.key), ...OUTCOME_TOGGLE_KEYS].map((k) => [k, src[k] !== false]));
}
// Full Vimeo URL or bare id → id digits ('' when unparseable).
export function vimeoId(v) { const m = String(v || '').match(/(\d{6,})/); return m ? m[1] : ''; }
export const FIRST_PLAYBOOK_BUSINESS_DAYS = 21;

// Comparison grid rows. `show` is a per-proposal toggle (compare_rows jsonb);
// `cell(plan)` yields true/false (check/dash) or a string. Order = display order.
export const COMPARE_ROW_DEFS = [
  { key: 'locations', label: 'Locations', note: () => 'Markets with their own page, profile, form route and review flow.', cell: (p) => String(p.locations) },
  { key: 'term', label: 'Term', note: () => 'Month-to-month after the initial term.', cell: (p) => `${p.termMonths} months` },
  { key: 'exclusivity', label: 'Market exclusivity', note: (o) => `We won't work with a competing manager within ${o.exclusivityMiles} miles of each of your markets.`, cell: (p) => !!p.exclusive },
  { key: 'guarantee', label: 'Results Guarantee', note: () => 'Growth covers our fees or you get a refund.', cell: (p) => !!p.guarantee },
  { key: 'portal', label: 'Growth Portal', note: () => 'Roadmap, playbook, leads, reports, billing.', cell: () => 'Every seat' },
  { key: 'referral', label: 'Referral discount', note: () => 'For each CAM firm you refer that signs.', cell: (p) => p.referralDiscount > 0 ? `−${_fmtUSD(p.referralDiscount)} / mo` : false },
  { key: 'setup', label: 'One-time setup', note: () => `Foundation & onboarding, first ${FIRST_PLAYBOOK_BUSINESS_DAYS} business days.`, cell: (p) => _fmtUSD(p.setup) },
  { key: 'monthly', label: 'Monthly investment', note: () => '', cell: (p) => _fmtUSD(p.monthly), strong: true },
];

export function defaultCompareRows() {
  return Object.fromEntries(COMPARE_ROW_DEFS.map((r) => [r.key, true]));
}
export function normalizeCompareRows(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(COMPARE_ROW_DEFS.map((r) => [r.key, src[r.key] !== false]));
}

// Rows × plans → cells the grid renders. A cell is {kind:'check'|'dash'|'text', text}.
export function compareRows(plans, toggles, opts = {}) {
  const t = normalizeCompareRows(toggles);
  const o = { exclusivityMiles: opts.exclusivityMiles || DEFAULT_EXCLUSIVITY_MILES };
  return COMPARE_ROW_DEFS.filter((r) => t[r.key]).map((r) => ({
    key: r.key, label: r.label, note: r.note(o), strong: !!r.strong,
    cells: (plans || []).map((p) => {
      const v = r.cell(p);
      if (v === true) return { kind: 'check' };
      if (v === false || v == null || v === '') return { kind: 'dash' };
      return { kind: 'text', text: String(v) };
    }),
  }));
}

// "How it pays for itself": how many new communities a year cover the fee.
export function roiFor({ monthly, feePerDoor, doors } = {}) {
  const feeYear = (Number(monthly) || 0) * 12;
  const perCommunity = (Number(feePerDoor) || 0) * (Number(doors) || 0) * 12;
  const communities = perCommunity > 0 && feeYear > 0 ? Math.max(1, Math.ceil(feeYear / perCommunity)) : 0;
  return {
    feeYear, perCommunity, communities,
    label: communities === 1 ? 'new community a year' : 'new communities a year',
  };
}

// Validity window. Dates compare as YYYY-MM-DD so time zones can't expire a
// proposal a day early.
export function isoDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
}
export function defaultValidThrough(from = new Date(), days = VALIDITY_DAYS) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
export function isExpired(validThrough, now = new Date()) {
  if (!validThrough) return false;
  return String(validThrough).slice(0, 10) < isoDate(now);
}

// Skip Saturdays and Sundays. n = 0 returns the same day.
export function addBusinessDays(from, n) {
  const d = new Date(from);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d;
}

// CMGT-2026-02 — short name, year, per-account sequence for the year.
export function proposalRef(shortName, year, seq) {
  const s = String(shortName || 'ALLOY').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'ALLOY';
  return `${s}-${year}-${String(Math.max(1, seq)).padStart(2, '0')}`;
}
export function nextRefSeq(existingRefs, shortName, year) {
  const prefix = proposalRef(shortName, year, 1).replace(/01$/, '');
  let max = 0;
  for (const r of existingRefs || []) {
    if (typeof r === 'string' && r.startsWith(prefix)) {
      const n = Number(r.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

// Legacy rows (before plans existed) still render: one plan from the v1 columns.
export function plansFromRow(row) {
  const plans = _normalizePlans(row && row.plans);
  if (plans.length) return plans;
  if (!row || row.monthly_amount == null) return [];
  return _normalizePlans([{
    key: 'plan', name: 'Growth plan', tagline: _planLocLabel({ locations: Number(row.locations_count) || 1 }),
    monthly: Number(row.monthly_amount) || 0, setup: Number(row.setup_amount) || 0,
    locations: Number(row.locations_count) || 1, termMonths: Number(row.term_months) || 12,
    guarantee: false, exclusive: false, referralDiscount: 0, recommended: true,
  }]);
}
