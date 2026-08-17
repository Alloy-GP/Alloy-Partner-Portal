import { describe, it, expect } from 'vitest';
import { deriveInitials, firstNameOf, ownersFromTeam, ownerFor, ownerShortLabel } from './proposalOwners.js';

// CMGT's REAL portal team, exactly as it sits in the database today.
// profiles.initials is empty for both, which is why initials are derived.
const CMGT_TEAM = [
  { id: 'p1', name: 'Amanda Betancourt', initials: '', role: 'staff', isStaff: false },
  { id: 'p2', name: 'Jeff Harman', initials: '', role: 'owner', isStaff: false },
  { id: 'p3', name: 'Skyler Nelson', initials: '', role: 'admin', isStaff: true },   // Alloy — must be excluded
];

describe('deriveInitials', () => {
  it('matches the key already stored on real proposals', () => {
    // Live rows carry owner='AB'; Amanda must keep resolving to it.
    expect(deriveInitials('Amanda Betancourt')).toBe('AB');
    expect(deriveInitials('Jeff Harman')).toBe('JH');
  });
  it('uses first + last, not first + middle', () => {
    expect(deriveInitials('Mary Anne Cornelius Smith')).toBe('MS');
  });
  it('handles one-word and messy names', () => {
    expect(deriveInitials('Cher')).toBe('CH');
    expect(deriveInitials('  amanda   betancourt  ')).toBe('AB');
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials(null)).toBe('');
  });
  it('is stable — the same name always gives the same key', () => {
    for (const n of ['Amanda Betancourt', 'Jeff Harman', 'Cher']) {
      expect(deriveInitials(n)).toBe(deriveInitials(n));
    }
  });
});

describe('ownersFromTeam', () => {
  const owners = ownersFromTeam(CMGT_TEAM);

  it("returns the client's own people, and only them", () => {
    expect(owners.map((o) => o.name)).toEqual(['Amanda Betancourt', 'Jeff Harman']);
  });
  it('excludes Alloy staff — an owner is the name a prospect will see', () => {
    expect(owners.some((o) => o.name === 'Skyler Nelson')).toBe(false);
  });
  it('includes the account owner the old hardcoded picker omitted', () => {
    const jeff = owners.find((o) => o.initials === 'JH');
    expect(jeff).toBeTruthy();
    expect(jeff.first).toBe('Jeff');
    expect(jeff.role).toBe('Owner');
  });
  it('offers nobody who is not on the account (no invented "Jordan")', () => {
    expect(owners.some((o) => /jordan/i.test(o.name))).toBe(false);
    expect(owners.some((o) => o.initials === 'JR')).toBe(false);
  });
  it('prefers a stored initials value when one exists', () => {
    const [o] = ownersFromTeam([{ name: 'Amanda Betancourt', initials: 'amb', isStaff: false }]);
    expect(o.initials).toBe('AMB');
  });
  it('disambiguates colliding initials instead of merging two people', () => {
    const o = ownersFromTeam([
      { name: 'Amanda Betancourt', isStaff: false },
      { name: 'Alan Brooks', isStaff: false },
      { name: 'Aaron Bell', isStaff: false },
    ]);
    expect(o.map((x) => x.initials)).toEqual(['AB', 'ABB', 'ABC']);
    expect(new Set(o.map((x) => x.initials)).size).toBe(3);
  });
  it('skips unnamed profiles rather than offering a blank owner', () => {
    expect(ownersFromTeam([{ name: '', isStaff: false }, { name: '   ', isStaff: false }])).toEqual([]);
  });
  it('is safe on missing input', () => {
    expect(ownersFromTeam()).toEqual([]);
    expect(ownersFromTeam(null)).toEqual([]);
  });
});

describe('ownerFor', () => {
  const owners = ownersFromTeam(CMGT_TEAM);
  const reps = { JR: { name: 'Jordan R.', first: 'Jordan', role: 'Client Partnerships' } };

  it('resolves a real stored key to the real person', () => {
    expect(ownerFor(owners, 'AB', reps).name).toBe('Amanda Betancourt');
    expect(ownerFor(owners, 'JH', reps).first).toBe('Jeff');
    expect(ownerFor(owners, 'AB', reps).stale).toBeUndefined();
  });
  // Historical rows must still render a name, but be marked stale so the UI can
  // tell "current team member" from "whoever used to own this".
  it('falls back to the CAM profile for a key no longer on the team', () => {
    const o = ownerFor(owners, 'JR', reps);
    expect(o.name).toBe('Jordan R.');
    expect(o.stale).toBe(true);
  });
  it('never renders raw initials as a name without marking them stale', () => {
    const o = ownerFor(owners, 'ZZ', reps);
    expect(o.stale).toBe(true);
  });
  it('returns null for no owner rather than inventing one', () => {
    expect(ownerFor(owners, '', reps)).toBe(null);
    expect(ownerFor(owners, null, reps)).toBe(null);
  });
});

describe('ownerShortLabel', () => {
  it('shortens to first name + last initial', () => {
    const owners = ownersFromTeam(CMGT_TEAM);
    expect(ownerShortLabel(owners[0])).toBe('Amanda B.');
    expect(ownerShortLabel(owners[1])).toBe('Jeff H.');
  });
  it('leaves a single-word name alone', () => {
    expect(ownerShortLabel({ name: 'Cher', first: 'Cher' })).toBe('Cher');
  });
  it('is safe on nothing', () => {
    expect(ownerShortLabel(null)).toBe('');
  });
});

describe('firstNameOf', () => {
  it('takes the first token', () => {
    expect(firstNameOf('Amanda Betancourt')).toBe('Amanda');
    expect(firstNameOf('')).toBe('');
  });
});
