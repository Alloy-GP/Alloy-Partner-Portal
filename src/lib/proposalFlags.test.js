// intakeFlags is the "CHECK WITH THEM FIRST" panel — the notes a rep reads before
// sending. It re-derives the recommendation to compare against what the row
// stores, so it has to be given the same per-CAM service map the mint used, or it
// contradicts the recommendation it is checking.
import { describe, it, expect } from 'vitest';
import { intakeFlags } from './proposalTier.js';
import { DEFAULT_CAM } from './camProfiles.js';

const ST = DEFAULT_CAM.serviceTiers;
const opts = { serviceTiers: ST };
const codes = (raw, o = opts) => intakeFlags(raw, o).map((f) => f.code);

const onsiteLead = {
  tierId: 'onsite', perHome: 0, homes: 175, budget: 'Open — looking for the right fit, not the cheapest',
  metaStatus: 'Looking to switch from current provider', metaType: 'Townhomes',
  services: 'Vendor coordination, On-site staff', selectedPains: [],
};

describe('the flags panel sees the same recommendation as the mint', () => {
  it('does not accuse a correctly-minted on-site lead of contradicting the form', () => {
    expect(codes(onsiteLead)).not.toContain('tier-vs-intake');
  });

  it('without the map it raises exactly that false contradiction (the bug)', () => {
    // Kept as a test so the seam cannot be dropped again: this is what the panel
    // did before enrichLead passed the CAM through.
    expect(intakeFlags(onsiteLead).map((f) => f.code)).toContain('tier-vs-intake');
  });

  it('still catches a genuinely stale tier', () => {
    // 834 homes stored as Full-Service: on-site is the model at 500+.
    expect(codes({ ...onsiteLead, tierId: 'full', perHome: 8.98, homes: 834 })).toContain('tier-vs-intake');
  });
});

describe('a deliberate tier is not nagged about', () => {
  it('suppresses the contradiction when a human set the tier', () => {
    const manual = { ...onsiteLead, tierId: 'financial', perHome: 4, tierManual: true };
    expect(codes(manual)).not.toContain('tier-vs-intake');
    expect(codes(manual)).not.toContain('downsell-candidate');
  });
});

describe('the downsell note', () => {
  it('appears when everything they asked for sits in the fallback tier', () => {
    const f = intakeFlags({ ...onsiteLead, tierId: 'full', perHome: 8.98, services: 'Reserve planning' }, opts);
    const note = f.find((x) => x.code === 'downsell-candidate');
    expect(note).toBeTruthy();
    expect(note.label).toMatch(/Financial & Administrative/);
    expect(note.detail).toMatch(/Reserve planning/);
  });

  it('does not appear when they asked for full-service work', () => {
    expect(codes({ ...onsiteLead, tierId: 'full', perHome: 8.98, services: 'Board meeting support' }))
      .not.toContain('downsell-candidate');
  });
});
