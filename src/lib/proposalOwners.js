// ============================================================================
// Who can own a proposal — the CLIENT'S REAL PEOPLE, not a hardcoded pair.
//
// WHAT WAS WRONG. The owner picker offered exactly two options, written into the
// component as `['AB', 'JR']`, and camProfiles resolved them to:
//   AB -> Amanda Betancourt, COO          <- a real CMGT person
//   JR -> "Jordan R.",  Client Partnerships <- nobody. Invented. The truncated
//                                            surname is the tell.
// Meanwhile CMGT's ACTUAL portal team is Amanda Betancourt and Jeff Harman
// (CEO & founder) — so the picker offered a person who does not exist and omitted
// the account's owner. Every proposal Jeff worked had to be filed under Amanda or
// a fictional colleague, and the board document then told the prospect a made-up
// name would be their contact.
//
// The real team was already loaded: loadData puts every profile on the account
// into DATA.team ({ name, initials, role, isStaff }). Nothing used it here.
//
// profiles.initials is EMPTY for every profile in the database today (0 of 12
// across all accounts), so initials are derived from the name rather than read.
// That derivation is stable and matches what is already stored: proposals carry
// owner='AB', and "Amanda Betancourt" derives to exactly 'AB'.
// ============================================================================

// "Amanda Betancourt" -> "AB". Single word -> first two letters ("Cher" -> "CH").
// Deliberately deterministic: `owner` is persisted as these initials, so the same
// name must always produce the same key.
export function deriveInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// The account's own people, in a shape the picker and the board document share.
// Alloy staff are excluded: a proposal owner is the CAM's salesperson, the name a
// prospect will see, not whoever at Alloy happens to be looking at the screen.
//
// Collisions are disambiguated rather than silently merged — two people sharing
// initials would otherwise overwrite each other, and `owner` is a stored key.
export function ownersFromTeam(team = []) {
  const people = (team || []).filter((p) => p && !p.isStaff && String(p.name || '').trim());
  const used = new Set();
  return people.map((p) => {
    const base = (p.initials && String(p.initials).trim().toUpperCase()) || deriveInitials(p.name);
    let key = base || 'XX';
    // AB taken -> ABB -> ABC … stable for a given ordering, and never blank.
    for (let i = 0; used.has(key); i++) key = base + String.fromCharCode(66 + i);
    used.add(key);
    return {
      initials: key,
      name: p.name,
      first: firstNameOf(p.name),
      // The person's real job title when we have one. Falling back to the portal
      // PERMISSION level is why CMGT's COO was shown to boards as "Team".
      role: String(p.title || '').trim()
        || (p.role === 'owner' ? 'Owner' : p.role === 'accounting' ? 'Accounting' : 'Team'),
      id: p.id || null,
    };
  });
}

// Resolve a stored owner key to a person. Falls back to the CAM profile's reps so
// a historical key (e.g. a proposal filed under someone since removed) still
// renders a name instead of raw initials.
export function ownerFor(owners, key, camReps) {
  if (!key) return null;
  const hit = (owners || []).find((o) => o.initials === key);
  if (hit) return hit;
  const rep = camReps && camReps[key];
  if (rep) return { initials: key, name: rep.name, first: rep.first, role: rep.role, id: null, stale: true };
  return { initials: key, name: key, first: key, role: '', id: null, stale: true };
}

export const ownerShortLabel = (person) =>
  person ? (person.first && person.name !== person.first
    ? `${person.first} ${String(person.name).trim().split(/\s+/).slice(-1)[0][0]}.`
    : person.name) : '';
