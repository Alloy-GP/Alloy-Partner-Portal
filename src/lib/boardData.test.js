import { describe, it, expect } from 'vitest';
import { buildSubmission } from './boardData.js';
import { TIER_MIN_MONTHLY } from './proposalTier.js';

// buildSubmission is the adapter behind the PUBLIC board document — the page a
// prospect opens from a magic link. It is the one pricing surface where being
// wrong is visible outside the company, and it deliberately does NOT go through
// pricing() (importing proposalMockData here would create a cycle), so these
// tests are what keep the two adapters honest with each other.
const lead = (over = {}) => ({
  id: '252457046', community: 'Chappell Creek LOA', shortName: 'Chappell Creek',
  contact: "Chelly O'Connor", firstName: 'Chelly', city: 'Chappell Hill, TX',
  homes: 12, perHome: 4.0, tierId: 'financial',
  metaType: 'Single-family', metaStatus: 'Self-managed by board',
  concerns: [], selectedPains: [], ...over,
});

const recTier = (s) => s.tiers.find((t) => t.id === s.recommendedTierId);

describe('buildSubmission — the tier the prospect is SHOWN', () => {
  // Three separate hardcoded "full"s used to mean a board that asked for
  // financial-only was still shown Full-Service.
  it('shows the tier the lead was actually recommended', () => {
    const s = buildSubmission(lead());
    expect(s.recommendedTierId).toBe('financial');
    expect(s.tiersToShow).toEqual(['financial']);
    expect(recTier(s).name).toBe('Financial & Administrative');
  });

  it('still shows full-service when that is the recommendation', () => {
    const s = buildSubmission(lead({ tierId: 'full', perHome: 8.98, homes: 240 }));
    expect(s.recommendedTierId).toBe('full');
    expect(recTier(s).name).toBe('Full-Service Management');
  });

  it('falls back to full only when the lead names no tier', () => {
    expect(buildSubmission(lead({ tierId: undefined })).recommendedTierId).toBe('full');
  });

  // ExpPricing does `visible.find(t => t.id === selected) || visible[0]`, so a
  // recommendation missing from tiersToShow silently reverts to another tier.
  it('always includes the recommended tier in the tiers it renders', () => {
    for (const tierId of ['full', 'financial', 'onsite']) {
      const s = buildSubmission(lead({ tierId }));
      expect(s.tiersToShow).toContain(s.recommendedTierId);
      expect(s.tiers.some((t) => t.id === s.recommendedTierId)).toBe(true);
    }
  });
});

describe('buildSubmission — the price the prospect SEES', () => {
  it('applies the minimum instead of the raw per-home math', () => {
    const t = recTier(buildSubmission(lead()));   // 12 x $4.00 = $48
    expect(t.monthlyTotal).toBe(TIER_MIN_MONTHLY.financial);
    expect(t.annualTotal).toBe(TIER_MIN_MONTHLY.financial * 12);
    expect(t.minimumApplied).toBe(true);
    expect(t.minimumProvisional).toBe(true);
  });

  // Showing "$4.00 per home x 12 homes = $48.00 / month" above a $100 total is
  // arithmetic that does not equal the total.
  it('never prints a calcLine that contradicts the total', () => {
    for (const over of [{}, { homes: 240, perHome: 8.98, tierId: 'full' }, { homes: 62, perHome: 8.98, tierId: 'full' }, { tierId: 'onsite', homes: 600, perHome: 0 }]) {
      const t = recTier(buildSubmission(lead(over)));
      const m = /= \$([0-9,]+\.[0-9]{2}) \/ month/.exec(t.calcLine || '');
      if (m) expect(Number(m[1].replace(/,/g, ''))).toBeCloseTo(t.monthlyTotal, 2);
    }
  });

  it('says "minimum monthly fee" rather than multiplying, when the floor binds', () => {
    expect(recTier(buildSubmission(lead())).calcLine).toMatch(/minimum monthly fee/i);
  });

  it('shows plain per-home math when the floor does not bind', () => {
    const t = recTier(buildSubmission(lead({ tierId: 'full', perHome: 8.98, homes: 240 })));
    expect(t.monthlyTotal).toBeCloseTo(2155.2, 2);
    expect(t.calcLine).toMatch(/per home ×/);
    expect(t.minimumApplied).toBe(false);
    expect(t.minimumProvisional).toBe(false);
  });

  it('keeps annual exactly twelve times monthly, every tier', () => {
    for (const tierId of ['full', 'financial', 'onsite']) {
      const t = recTier(buildSubmission(lead({ tierId, homes: 300, perHome: 8.98 })));
      expect(t.annualTotal).toBeCloseTo(t.monthlyTotal * 12, 6);
    }
  });

  // On-site's flat fee is just as invented as the other floors.
  it('marks the on-site flat fee as provisional and does not multiply', () => {
    const t = recTier(buildSubmission(lead({ tierId: 'onsite', homes: 600, perHome: 0 })));
    expect(t.monthlyTotal).toBe(TIER_MIN_MONTHLY.onsite);
    expect(t.minimumProvisional).toBe(true);
    expect(t.calcLine).toMatch(/flat monthly fee/i);
  });

  it('lets a deliberate on-site rate beat the placeholder', () => {
    const t = recTier(buildSubmission(lead({ tierId: 'onsite', homes: 600, perHome: 5.0 })));
    expect(t.monthlyTotal).toBe(3000);
    expect(t.minimumProvisional).toBe(false);
  });

  it('never renders a negative or NaN total on junk input', () => {
    for (const over of [{ homes: 0, perHome: 0 }, { homes: NaN, perHome: NaN }, { homes: undefined, perHome: undefined }]) {
      const t = recTier(buildSubmission(lead(over)));
      expect(Number.isFinite(t.monthlyTotal)).toBe(true);
      expect(t.monthlyTotal).toBeGreaterThan(0);
    }
  });
});
