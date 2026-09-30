import { describe, it, expect } from 'vitest';
import {
  normalizePlans, pickPlan, dueAtStart, planLocLabel, marketsFor, fmtUSD, termWords, longDate,
  compareRows, defaultCompareRows, normalizeCompareRows, normalizeCustomRows, roiFor, defaultValidThrough, isExpired, addBusinessDays,
  proposalRef, nextRefSeq, plansFromRow, agreementDocument, agreementText, PLAN_TEMPLATES, COMPARE_ROW_DEFS, ALLOY_LEGAL,
} from './proposalPlans.js';

describe('normalizePlans', () => {
  it('coerces numbers, slugs keys, caps at three, and keeps exactly one recommended', () => {
    const p = normalizePlans([
      { name: 'Core', monthly: '3200', setup: '2500', locations: '1' },
      { name: 'Growth', monthly: 6850, setup: 2500, locations: 3, recommended: true, guarantee: true, exclusive: true, referralDiscount: 150 },
      { name: 'Scale', monthly: 9400, setup: 2500, locations: 5, recommended: true },
      { name: 'Fourth', monthly: 1 },
    ]);
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.key)).toEqual(['core', 'growth', 'scale']);
    expect(p[0]).toMatchObject({ monthly: 3200, setup: 2500, locations: 1, termMonths: 12, guarantee: false, exclusive: false, referralDiscount: 0 });
    expect(p.filter((x) => x.recommended).map((x) => x.key)).toEqual(['growth']); // first marked wins
  });
  it('marks the first plan recommended when none is, drops nameless junk, dedupes keys', () => {
    const p = normalizePlans([{ name: 'A', monthly: 1 }, { monthly: 5 }, null, { name: 'A', monthly: 2 }]);
    expect(p.map((x) => x.key)).toEqual(['a', 'a-2']);
    expect(p[0].recommended).toBe(true); expect(p[1].recommended).toBe(false);
    expect(normalizePlans(undefined)).toEqual([]);
  });
  it('templates are valid plans', () => {
    const p = normalizePlans(PLAN_TEMPLATES);
    expect(p).toHaveLength(3); expect(pickPlan(p).key).toBe('growth');
  });
});

describe('pickPlan / labels / money', () => {
  const plans = normalizePlans(PLAN_TEMPLATES);
  it('picks by key, else recommended, else first', () => {
    expect(pickPlan(plans, 'scale').name).toBe('Scale');
    expect(pickPlan(plans, 'nope').name).toBe('Growth');
    expect(pickPlan([], 'x')).toBeNull();
  });
  it('due at start = first month + setup; labels pluralise', () => {
    expect(dueAtStart(plans[1])).toBe(9350);
    expect(planLocLabel(plans[0])).toBe('1 location'); expect(planLocLabel(plans[1])).toBe('3 locations');
    expect(fmtUSD(6850)).toBe('$6,850'); expect(fmtUSD(12.5)).toBe('$12.50');
    expect(termWords(12)).toBe('twelve (12) months'); expect(termWords(1)).toBe('one (1) month'); expect(termWords(36)).toBe('thirty-six (36) months');
    expect(longDate('2026-11-01')).toBe('November 1, 2026'); expect(longDate('bad')).toBe('');
  });
  it('markets: named up to the plan count, the rest to be named', () => {
    const names = [{ name: 'Denham Springs, LA' }, 'Biloxi, MS'];
    expect(marketsFor(names, plans[0])).toEqual({ named: ['Denham Springs, LA'], unnamed: 0 });
    expect(marketsFor(names, plans[2])).toEqual({ named: ['Denham Springs, LA', 'Biloxi, MS'], unnamed: 3 });
  });
});

describe('compare rows', () => {
  const plans = normalizePlans(PLAN_TEMPLATES);
  it('defaults every row on; false hides; unknown keys ignored', () => {
    expect(Object.values(defaultCompareRows()).every(Boolean)).toBe(true);
    const t = normalizeCompareRows({ referral: false, bogus: true });
    expect(t.referral).toBe(false); expect(t.monthly).toBe(true); expect('bogus' in t).toBe(false);
    expect(compareRows(plans, { referral: false }).map((r) => r.key)).not.toContain('referral');
  });
  it('renders checks, dashes and text per plan, with the exclusivity radius in the note', () => {
    const rows = compareRows(plans, {}, { exclusivityMiles: 20 });
    const ex = rows.find((r) => r.key === 'exclusivity');
    expect(ex.note).toContain('20 miles');
    expect(ex.cells.map((c) => c.kind)).toEqual(['dash', 'check', 'check']);
    expect(rows.find((r) => r.key === 'monthly')).toMatchObject({ strong: true });
    expect(rows.find((r) => r.key === 'monthly').cells[1]).toEqual({ kind: 'text', text: '$6,850' });
    expect(rows.find((r) => r.key === 'referral').cells[0]).toEqual({ kind: 'text', text: '−$150 / mo' });
    expect(COMPARE_ROW_DEFS.map((r) => r.key)).toEqual(['locations', 'term', 'exclusivity', 'guarantee', 'portal', 'referral', 'setup', 'monthly']);
  });
});

describe('custom comparison rows', () => {
  const plans = normalizePlans(PLAN_TEMPLATES);
  it('normalises, drops nameless rows, coerces cells', () => {
    const rows = normalizeCustomRows([{ label: ' Strategy calls ', note: 'per quarter', cells: { core: '1', growth: true, scale: null } }, { label: '', cells: {} }, null]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'c1', label: 'Strategy calls', note: 'per quarter', cells: { core: '1', growth: true, scale: false } });
  });
  it('renders between the standard rows and Monthly investment, one cell per plan', () => {
    const rows = compareRows(plans, {}, { customRows: [{ id: 'x', label: 'Strategy calls', cells: { growth: true, scale: '2 / quarter' } }] });
    const keys = rows.map((r) => r.key);
    expect(keys[keys.length - 1]).toBe('monthly');
    expect(keys[keys.length - 2]).toBe('custom-x');
    const c = rows.find((r) => r.key === 'custom-x');
    expect(c.custom).toBe(true);
    expect(c.cells).toEqual([{ kind: 'dash' }, { kind: 'check' }, { kind: 'text', text: '2 / quarter' }]);
  });
  it('lands at the end when Monthly investment is hidden', () => {
    const rows = compareRows(plans, { monthly: false }, { customRows: [{ id: 'x', label: 'Extra', cells: {} }] });
    expect(rows[rows.length - 1].key).toBe('custom-x');
  });
});

describe('roiFor', () => {
  it('ceil(fee year / (door × doors × 12)), min 1, singular label', () => {
    expect(roiFor({ monthly: 6850, feePerDoor: 14, doors: 150 })).toMatchObject({ feeYear: 82200, perCommunity: 25200, communities: 4, label: 'new communities a year' });
    expect(roiFor({ monthly: 1000, feePerDoor: 14, doors: 150 })).toMatchObject({ communities: 1, label: 'new community a year' });
    expect(roiFor({ monthly: 1000, feePerDoor: 0, doors: 150 }).communities).toBe(0);
  });
});

describe('validity / dates / refs', () => {
  it('valid through = +30 days; expiry compares by date, not time', () => {
    expect(defaultValidThrough(new Date('2026-09-30T23:59:00Z'))).toBe('2026-10-30');
    expect(isExpired('2026-10-30', new Date('2026-10-30T23:00:00Z'))).toBe(false);
    expect(isExpired('2026-10-30', new Date('2026-10-31T00:00:01Z'))).toBe(true);
    expect(isExpired(null)).toBe(false);
  });
  it('business days skip weekends', () => {
    // Fri Oct 2 2026 + 1 business day = Mon Oct 5
    expect(addBusinessDays(new Date('2026-10-02T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(addBusinessDays(new Date('2026-11-02T12:00:00Z'), 21).toISOString().slice(0, 10)).toBe('2026-12-01');
  });
  it('refs are SHORT-YEAR-NN and sequence per account-year', () => {
    expect(proposalRef('CMGT', 2026, 2)).toBe('CMGT-2026-02');
    expect(proposalRef('cma test!', 2026, 12)).toBe('CMATEST-2026-12');
    expect(nextRefSeq(['CMGT-2026-01', 'CMGT-2026-03', 'CMGT-2025-09', 'EDISON-2026-01'], 'CMGT', 2026)).toBe(4);
    expect(nextRefSeq([], 'CMGT', 2026)).toBe(1);
  });
});

describe('plansFromRow (legacy v1 rows)', () => {
  it('synthesises one plan from the summary columns when plans is empty', () => {
    const p = plansFromRow({ plans: [], monthly_amount: '4250', setup_amount: null, locations_count: 2, term_months: 12 });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: 'plan', monthly: 4250, setup: 0, locations: 2, recommended: true });
    expect(plansFromRow({ plans: [], monthly_amount: null })).toEqual([]);
    expect(plansFromRow({ plans: PLAN_TEMPLATES })).toHaveLength(3);
  });
});

describe('agreementDocument', () => {
  const plan = normalizePlans(PLAN_TEMPLATES)[1];
  const doc = agreementDocument({
    ref: 'CMGT-2026-02', clientLegalName: 'Community Management, LLC', clientEntityType: 'Louisiana limited liability company',
    clientAddress: '140 Aspen Square, Suite H, Denham Springs, LA 70726', effectiveDate: '2026-11-01', plan,
    markets: ['Denham Springs, LA', 'Biloxi, MS', 'Lafayette, LA'], signerName: 'Jeff Harman', signerTitle: 'CEO',
  });
  it('fills the facts grid from the plan and the client', () => {
    const f = Object.fromEntries(doc.facts.map((x) => [x.k, x.v]));
    expect(f.Client).toBe('Community Management, LLC');
    expect(f.Plan).toBe('Growth · 3 locations');
    expect(f.Markets).toBe('Denham Springs, LA · Biloxi, MS · Lafayette, LA');
    expect(f['Monthly investment']).toBe('$6,850 / month');
    expect(f.Term).toBe('12 months, from November 1, 2026');
    expect(f['Growth Guarantee']).toBe('Included (Sec. 8.8)');
    expect(f.Alloy).toBe(`${ALLOY_LEGAL.name}, ${ALLOY_LEGAL.city}`);
  });
  it('interpolates the real contract text and includes the guarantee clauses only when the plan has them', () => {
    expect(doc.preamble).toContain('COMMUNITY MANAGEMENT, LLC SERVICE AGREEMENT');
    expect(doc.preamble).toContain('November 1, 2026');
    expect(doc.sections).toHaveLength(25);
    const fees = doc.sections.find((s) => s.n === '8');
    expect(fees.subs.some((s) => s.n === '8.8')).toBe(true);
    expect(fees.subs.find((s) => s.n === '8.1').body).toContain('$6,850 per month');
    expect(doc.sections.find((s) => s.n === '16').body).toContain('Jeff Harman, CEO');
    expect(doc.sections.find((s) => s.n === '11').subs[0].body).toContain('twelve (12) months');
    const noG = agreementDocument({ plan: { ...plan, guarantee: false }, clientLegalName: 'X' });
    expect(noG.sections.find((s) => s.n === '8').subs.some((s) => s.n === '8.8')).toBe(false);
  });
  it('renders deterministic text for hashing and names both signers', () => {
    const t = agreementText(doc);
    expect(t.startsWith('ALLOY CREATIVES & COMMUNITY MANAGEMENT, LLC SERVICE AGREEMENT')).toBe(true);
    expect(t).toContain('For Community Management, LLC: Jeff Harman, CEO');
    expect(t).toContain(`For ${ALLOY_LEGAL.name}: ${ALLOY_LEGAL.signer}`);
    expect(agreementText(doc)).toBe(doc.text);
  });
  it('degrades to bracketed placeholders when legal fields are missing', () => {
    const d = agreementDocument({ plan, markets: [] });
    expect(d.legalName).toBe('[Client legal name]');
    expect(d.signer).toBe('Authorized signer');
    expect(d.facts.find((f) => f.k === 'Markets').v).toBe('3 locations (to be named)');
  });
});
