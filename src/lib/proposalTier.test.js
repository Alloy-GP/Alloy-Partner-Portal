import { describe, it, expect } from 'vitest';
import { TIERS, tierById, budgetIntent, recommendTier, intakeFlags, isHighRise } from './proposalTier.js';

// The three budget strings the live form actually submits, verbatim (em dashes and all).
const B_OPEN = 'Open — looking for the right fit, not the cheapest';
const B_LEAN = 'Cost-sensitive — need a lean option';
const B_FIN = 'Tight budget — financial only';

describe('budgetIntent — against the real form options', () => {
  it('reads all three verbatim', () => {
    expect(budgetIntent(B_OPEN)).toBe('open');
    expect(budgetIntent(B_LEAN)).toBe('lean');
    expect(budgetIntent(B_FIN)).toBe('financial-only');
  });
  it('survives straight dashes, casing and whitespace drift', () => {
    expect(budgetIntent('Tight budget - FINANCIAL ONLY')).toBe('financial-only');
    expect(budgetIntent('  cost-sensitive  ')).toBe('lean');
  });
  it('is unstated when blank', () => {
    expect(budgetIntent('')).toBe('unstated');
    expect(budgetIntent(undefined)).toBe('unstated');
  });
});

describe('recommendTier', () => {
  // The exact case from the screenshot: 12 homes, self-managed, financial-only.
  it('recommends Financial & Administrative for "Tight budget — financial only"', () => {
    const r = recommendTier({ homes: 12, budget: B_FIN, metaStatus: 'Self-managed by board', metaType: 'Single-family' });
    expect(r.tierId).toBe('financial');
    expect(r.tierName).toBe('Financial & Administrative');
    expect(r.perHome).toBe(4.0);
    expect(r.why).toMatch(/financial-only/i);
  });

  it('recommends Financial & Administrative for a cost-sensitive lean budget', () => {
    const r = recommendTier({ homes: 40, budget: B_LEAN, metaStatus: 'Self-managed by board' });
    expect(r.tierId).toBe('financial');
    expect(r.why).toMatch(/cost-sensitive/i);
  });

  it('keeps Full-Service when they say they are open to the right fit', () => {
    const r = recommendTier({ homes: 62, budget: B_OPEN, metaStatus: 'Looking to switch from current provider' });
    expect(r.tierId).toBe('full');
    expect(r.perHome).toBe(8.98);
    expect(r.why).toMatch(/right fit/i);
  });

  it('defaults to Full-Service with no budget answer', () => {
    const r = recommendTier({ homes: 53 });
    expect(r.tierId).toBe('full');
  });

  // Scale beats preference: on-site is a staffing model.
  it('recommends On-Site at 500+ homes even on a lean budget', () => {
    const r = recommendTier({ homes: 450, budget: B_LEAN });
    expect(r.tierId).toBe('financial');           // 450 < 500
    const big = recommendTier({ homes: 500, budget: B_LEAN });
    expect(big.tierId).toBe('onsite');
    expect(big.perHome).toBe(null);               // flat fee, not per-home
    expect(big.flatMonthly).toBe(2500);
    expect(big.why).toMatch(/500\+/);
  });

  it('recommends On-Site for a high-rise regardless of size', () => {
    const r = recommendTier({ homes: 80, metaType: 'High-rise condominium', budget: B_OPEN });
    expect(r.tierId).toBe('onsite');
    expect(r.why).toMatch(/high-rise/i);
  });

  it('explains a developer-controlled setup', () => {
    const r = recommendTier({ homes: 200, metaStatus: 'New construction / developer-controlled' });
    expect(r.tierId).toBe('full');
    expect(r.why).toMatch(/developer/i);
  });

  it('always returns a why, so the price on screen is attributable', () => {
    for (const raw of [{}, { homes: 12 }, { homes: 900 }, { budget: B_FIN }]) {
      expect(recommendTier(raw).why).toBeTruthy();
    }
  });

  it('never returns a tier id outside the catalog', () => {
    const ids = TIERS.map((t) => t.id);
    for (const raw of [{}, { homes: 1 }, { homes: 1e6 }, { budget: 'nonsense' }]) {
      expect(ids).toContain(recommendTier(raw).tierId);
    }
  });
});

describe('isHighRise', () => {
  it('catches the vertical wordings and nothing else', () => {
    expect(isHighRise('High-rise')).toBe(true);
    expect(isHighRise('highrise tower')).toBe(true);
    expect(isHighRise('Mid-Rise')).toBe(true);
    expect(isHighRise('Single-family')).toBe(false);
    expect(isHighRise('Condos')).toBe(false);
    expect(isHighRise('')).toBe(false);
  });
});

describe('intakeFlags — the contradictions the form lets a board submit', () => {
  // Chappell Creek LOA, verbatim from the live row.
  const chappell = {
    homes: 12,
    budget: B_FIN,
    metaStatus: 'Self-managed by board',
    metaType: 'Single-family',
    selectedPains: ['homeowner-apathy', 'developer'],
    tierId: 'financial',
  };

  it('flags developer-controlled against a self-managed answer', () => {
    const codes = intakeFlags(chappell).map((f) => f.code);
    expect(codes).toContain('developer-vs-status');
    const f = intakeFlags(chappell).find((x) => x.code === 'developer-vs-status');
    expect(f.detail).toContain('Self-managed by board');
  });

  it('flags a 12-unit community as too small for per-home math', () => {
    expect(intakeFlags(chappell).map((f) => f.code)).toContain('tiny-community');
  });

  it('does NOT flag developer-vs-status when they really are developer-controlled', () => {
    const codes = intakeFlags({ ...chappell, metaStatus: 'New construction / developer-controlled' }).map((f) => f.code);
    expect(codes).not.toContain('developer-vs-status');
  });

  it('does not invent a contradiction when the status is blank', () => {
    const codes = intakeFlags({ ...chappell, metaStatus: '' }).map((f) => f.code);
    expect(codes).not.toContain('developer-vs-status');
  });

  it('flags switching-providers against self-managed', () => {
    const codes = intakeFlags({ ...chappell, selectedPains: ['switching'] }).map((f) => f.code);
    expect(codes).toContain('switching-vs-selfmanaged');
  });

  // "NA" and "1" are both real submitted unit counts.
  it('flags an unusable unit count', () => {
    expect(intakeFlags({ ...chappell, homes: 0 }).map((f) => f.code)).toContain('no-unit-count');
    expect(intakeFlags({ ...chappell, homes: 1 }).map((f) => f.code)).toContain('tiny-community');
  });

  it('flags Full-Service chosen against a lean budget', () => {
    const codes = intakeFlags({ ...chappell, tierId: 'full' }).map((f) => f.code);
    expect(codes).toContain('tier-vs-budget');
  });

  it('does not flag tier-vs-budget when the tier matches the budget', () => {
    const codes = intakeFlags({ ...chappell, tierId: 'financial' }).map((f) => f.code);
    expect(codes).not.toContain('tier-vs-budget');
  });

  it('flags a missing budget answer', () => {
    expect(intakeFlags({ homes: 60, budget: '' }).map((f) => f.code)).toContain('no-budget');
  });

  it('returns nothing for a clean, consistent submission', () => {
    expect(intakeFlags({
      homes: 240, budget: B_OPEN, metaStatus: 'Looking to switch from current provider',
      metaType: 'Single-family', selectedPains: ['communication', 'transparency'], tierId: 'full',
    })).toEqual([]);
  });

  it('every flag carries a label and an actionable detail', () => {
    for (const f of intakeFlags(chappell)) {
      expect(f.label).toBeTruthy();
      expect(f.detail.length).toBeGreaterThan(20);
    }
  });
});

describe('tierById', () => {
  it('resolves each id and falls back to full', () => {
    expect(tierById('financial').name).toBe('Financial & Administrative');
    expect(tierById('onsite').name).toBe('On-Site Management');
    expect(tierById('nope').id).toBe('full');
  });
});
