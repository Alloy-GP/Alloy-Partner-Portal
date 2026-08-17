import { describe, it, expect } from 'vitest';
import { enrichLead, pricing } from './proposalMockData.js';

// The Build stage's live preview is an iframe pointing at /proposals/board/:token,
// and the public board page resolves a board_token ONLY — never a lead id, because
// WhatConverts lead ids are sequential and guessable. So the token has to survive
// the trip from the mint's .select() through enrichLead into the rendered row.
// It did not used to be read back at all, and the preview showed the board's
// "This proposal link is invalid or has expired" page for every lead qualified
// in-session, healing on the next reload. That is the seam this pins down.
describe('enrichLead preserves the board link secret', () => {
  // Alloy HOA, the live row that surfaced the bug.
  const raw = {
    id: '253085553', community: 'Alloy HOA', homes: 834, perHome: 0, tierId: 'onsite',
    selectedPains: ['delinquency', 'manager-turnover'], status: 'new',
    budget: 'Tight budget — financial only',
  };
  const TOKEN = 'a'.repeat(64);

  it('carries boardToken through enrichment', () => {
    expect(enrichLead({ ...raw, boardToken: TOKEN }).boardToken).toBe(TOKEN);
  });

  it('leaves it absent when the row has none, rather than inventing one', () => {
    // A fabricated token would resolve to nothing and look like an expired link;
    // absent is what lets the preview show an honest "preparing" panel instead.
    expect(enrichLead(raw).boardToken).toBeUndefined();
  });

  it('does not confuse the token with the lead id', () => {
    const e = enrichLead({ ...raw, boardToken: TOKEN });
    expect(e.id).toBe('253085553');
    expect(e.boardToken).not.toBe(e.id);
  });
});

// saveDetails re-derives the tier and pushes a fresh annual to the database, and
// enrichLead prefers an existing quoteValue over deriving one — so the recomputed
// figure has to be passed in explicitly or the screen keeps the stale number.
describe('enrichLead quoteValue precedence', () => {
  const raw = { id: '1', community: 'X', homes: 60, perHome: 4, tierId: 'financial', selectedPains: [] };

  it('prefers an explicitly supplied annual', () => {
    expect(enrichLead({ ...raw, quoteValue: 12345 }).quoteValue).toBe(12345);
  });

  it('derives the annual through the same floor as the screen when none is given', () => {
    // 60 x $4.00 = $240/mo, above the financial floor, so no flooring: x12.
    expect(enrichLead(raw).quoteValue).toBe(Math.round(pricing(raw).monthlyNum * 12));
    expect(enrichLead(raw).quoteValue).toBe(2880);
  });
});
