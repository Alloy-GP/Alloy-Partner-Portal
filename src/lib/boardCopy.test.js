// The board document calls the place by a name the board would recognise. Read
// off the community type they answered, so it self-corrects instead of relying
// on a rep to notice.
import { describe, it, expect } from 'vitest';
import { communityNoun } from './boardData.js';

describe('communityNoun', () => {
  it('says "buildings" only where there are buildings', () => {
    ['Condos', 'Condominium', 'Condo / townhome', 'High-Rise Condominium', 'High Rise', 'Mid-Rise', 'Tower']
      .forEach((t) => expect(communityNoun(t), t).toBe('buildings'));
  });

  it('says "community" for everything else CMGT manages', () => {
    // The live wizard's options, verbatim, minus the condo one.
    ['Single-family', 'Townhomes', 'Mixed — townhomes & single-family', 'Master / mixed-use',
     'Single-family HOA', 'Master-planned', 'Developer-controlled', 'Commercial / mixed-use']
      .forEach((t) => expect(communityNoun(t), t).toBe('community'));
  });

  it('falls back to "community" when the type is missing', () => {
    // Postcard-landing leads have no type field at all, so this is the common case
    // rather than an edge one.
    expect(communityNoun('')).toBe('community');
    expect(communityNoun(null)).toBe('community');
    expect(communityNoun(undefined)).toBe('community');
  });
});
