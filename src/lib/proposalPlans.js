// ============================================================================
// Proposal plans, comparison grid, sections, validity — pure logic for the
// proposal page (v3) and its Admin authoring. The parts the edge function also
// needs (plan normalisation, money, the agreement document) live in
// supabase/functions/engagement-proposal/proposalShared.js and are re-exported
// here so there is exactly one implementation. Tested in proposalPlans.test.js.
// ============================================================================
export {
  ALLOY_LEGAL, fmtUSD, termWords, longDate, slugKey, normalizePlans, pickPlan, visiblePlans,
  dueAtStart, planLocLabel, marketsFor, agreementDocument, agreementText,
  DEFAULT_EXCLUSIVITY_MILES,
} from '../../supabase/functions/engagement-proposal/proposalShared.js';
import { normalizePlans as _normalizePlans, fmtUSD as _fmtUSD, planLocLabel as _planLocLabel, DEFAULT_EXCLUSIVITY_MILES } from '../../supabase/functions/engagement-proposal/proposalShared.js';

// Prefill for a new proposal — staff edit from here. The three standard tiers
// (v3 handoff): Steady · Accelerate (recommended) · Ascend. `fuel` drives the
// striped bar under each plan's price; `matchHoa` = preferred-partner status.
export const PLAN_TEMPLATES = [
  { key: 'steady', name: 'Steady', tagline: 'One market', monthly: 3200, setup: 2500, locations: 1, termMonths: 12, guarantee: false, exclusive: false, matchHoa: false, portal: true, fuel: 35, referralDiscount: 150, recommended: false },
  { key: 'accelerate', name: 'Accelerate', tagline: 'Three markets', monthly: 6850, setup: 2500, locations: 3, termMonths: 12, guarantee: true, exclusive: true, matchHoa: true, portal: true, fuel: 70, referralDiscount: 150, recommended: true },
  { key: 'ascend', name: 'Ascend', tagline: 'Five markets', monthly: 9400, setup: 2500, locations: 5, termMonths: 12, guarantee: true, exclusive: true, matchHoa: true, portal: true, fuel: 100, referralDiscount: 150, recommended: false },
];
export const DEFAULT_TESTIMONIAL = { vimeoId: '1131397045', caption: 'Client testimonial · 2:58' };
export const VALIDITY_DAYS = 30;
export const FIRST_PLAYBOOK_BUSINESS_DAYS = 21;

// Fuel bar: the plan's own value, else relative to the priciest plan shown.
export function planFuel(plan, plans) {
  if (!plan) return 0;
  if (Number.isFinite(plan.fuel) && plan.fuel !== null) return Math.max(0, Math.min(100, plan.fuel));
  const max = Math.max(0, ...(plans || [plan]).map((p) => Number(p.monthly) || 0));
  return max > 0 ? Math.max(8, Math.round(((Number(plan.monthly) || 0) / max) * 100)) : 0;
}

// Page sections staff can switch off (sections jsonb on the row is {key: bool};
// missing = shown). Investment + the accept card never hide. The four
// "What to expect" blocks share the 02 heading; the heading goes when all four do.
export const SECTION_DEFS = [
  { key: 'results', n: '01', label: 'What you’re buying', note: 'Three-year plan: the 2× / 6×+ / 1× results block' },
  { key: 'baseline', n: '02', label: 'What to expect · the baseline', note: 'Everything a traditional agency does · capability chips' },
  { key: 'programs', n: '02', label: 'What to expect · three CAM programs', note: 'Reach (attract) · Match (close) · Retain (keep)' },
  { key: 'expertise', n: '02', label: 'What to expect · 35+ years inside CAM', note: 'Years band + 10 expertise tiles' },
  { key: 'partner', n: '02', label: 'What to expect · preferred partner network', note: 'The match HOA card' },
  { key: 'next', n: '04', label: 'Next steps', note: 'Three steps + Review terms and sign' },
];
export const EXPECT_KEYS = ['baseline', 'programs', 'expertise', 'partner'];
export function normalizeSections(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(SECTION_DEFS.map((s) => [s.key, src[s.key] !== false]));
}
// Full Vimeo URL or bare id → id digits ('' when unparseable).
export function vimeoId(v) { const m = String(v || '').match(/(\d{6,})/); return m ? m[1] : ''; }

// Comparison grid rows (v3 order). `show` is a per-proposal toggle
// (compare_rows jsonb); `cell(plan)` yields true/false (check/dash), a string,
// or {kind:'logo'} for the match HOA mark. Order = display order.
const LOGO = { kind: 'logo' };
export const COMPARE_ROW_DEFS = [
  { key: 'matchhoa', label: 'match HOA preferred partner', note: () => 'Boards searching on match HOA are introduced to you first.', cell: (p) => (p.matchHoa ? LOGO : false) },
  { key: 'locations', label: 'Locations', note: () => 'Markets with their own page, profile, form route and review flow.', cell: (p) => String(p.locations) },
  { key: 'term', label: 'Term', note: () => 'Month-to-month after the initial term.', cell: (p) => `${p.termMonths} months` },
  { key: 'exclusivity', label: 'Market exclusivity', note: (o) => `We won’t work with a competing manager within ${o.exclusivityMiles} miles of each of your markets.`, cell: (p) => !!p.exclusive },
  { key: 'guarantee', label: 'Results Guarantee', note: () => 'Your growth covers our fees. Money-back guaranteed.', cell: (p) => !!p.guarantee },
  { key: 'portal', label: 'Growth Portal', note: () => 'Roadmap, playbook, leads, reports, billing.', cell: (p) => (p.portal !== false ? 'Every seat' : false) },
  { key: 'referral', label: 'Referral discount', note: () => 'For each CAM firm you refer that signs.', cell: (p) => (p.referralDiscount > 0 ? `−${_fmtUSD(p.referralDiscount)} / mo` : false) },
  { key: 'setup', label: 'One-time setup', note: () => `Foundation & onboarding, first ${FIRST_PLAYBOOK_BUSINESS_DAYS} business days.`, cell: (p) => _fmtUSD(p.setup) },
  { key: 'monthly', label: 'Monthly investment', note: () => 'All discounts applied.', cell: (p) => _fmtUSD(p.monthly), strong: true },
];

export function defaultCompareRows() {
  return Object.fromEntries(COMPARE_ROW_DEFS.map((r) => [r.key, true]));
}
export function normalizeCompareRows(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(COMPARE_ROW_DEFS.map((r) => [r.key, src[r.key] !== false]));
}

// Staff-authored rows: [{ id, label, note, cells: { <planKey>: true|false|'text' } }].
// Anything malformed is dropped; a missing cell renders as a dash.
export function normalizeCustomRows(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.filter((r) => r && typeof r === 'object' && String(r.label || '').trim()).map((r, i) => ({
    id: String(r.id || `c${i + 1}`), label: String(r.label).trim(), note: String(r.note || '').trim(),
    cells: Object.fromEntries(Object.entries(r.cells && typeof r.cells === 'object' ? r.cells : {}).map(([k, v]) => [k, v === true ? true : v === false || v == null ? false : String(v)])),
  }));
}
const toCell = (v) => (v && typeof v === 'object' && v.kind) ? v : v === true ? { kind: 'check' } : (v === false || v == null || v === '') ? { kind: 'dash' } : { kind: 'text', text: String(v) };

// Rows × plans → cells the grid renders. A cell is {kind:'check'|'dash'|'text'|'logo', text}.
// Custom rows sit after the standard rows and before Monthly investment.
export function compareRows(plans, toggles, opts = {}) {
  const t = normalizeCompareRows(toggles);
  const o = { exclusivityMiles: opts.exclusivityMiles || DEFAULT_EXCLUSIVITY_MILES };
  const list = plans || [];
  const std = COMPARE_ROW_DEFS.filter((r) => t[r.key])
    // the partner row only earns its place when some shown plan has it
    .filter((r) => r.key !== 'matchhoa' || list.some((p) => p.matchHoa))
    .map((r) => ({
      key: r.key, label: r.label, note: r.note(o), strong: !!r.strong,
      cells: list.map((p) => toCell(r.cell(p))),
    }));
  const custom = normalizeCustomRows(opts.customRows).map((r) => ({
    key: `custom-${r.id}`, label: r.label, note: r.note, strong: false, custom: true,
    cells: list.map((p) => toCell(r.cells[p.key])),
  }));
  const last = std.length && std[std.length - 1].key === 'monthly' ? std.pop() : null;
  return [...std, ...custom, ...(last ? [last] : [])];
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
