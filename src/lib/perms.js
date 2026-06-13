// ============================================================
// Role capabilities — SINGLE SOURCE OF TRUTH.
//
// Two axes:
//   - is_staff  → which SIDE of the fence: Alloy ('alloy') vs client ('client')
//   - role      → the LEVEL within that side
//
//   Alloy:  admin | staff
//   Client: owner | staff | accounting
//
// A user's identity key is `${side}:${role}`, e.g. 'alloy:admin', 'client:owner'.
// ('staff' is shared across both sides; the side prefix disambiguates.)
//
// To change what a role can do, edit ONE entry in CAPS below — every gate in
// the app reads from here. (Phase 2 will wire screen/billing gates to these;
// Phase 1 only consumes `newRequest`.) If we later want to toggle permissions
// without a deploy, promote this object to a small DB table edited from Admin
// and load it into the same shape.
// ============================================================

// Human-facing role labels + which side each belongs to. Used by Admin's invite
// picker (client side) and anywhere we render a role badge.
export const CLIENT_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'staff', label: 'Staff' },
  { value: 'accounting', label: 'Accounting' },
];
export const ALLOY_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
];

// capability -> the identity keys allowed to use it.
const CAPS = {
  // Who may open a new request (create a Zendesk ticket). Client-facing action:
  // every client role can; on the Alloy side only admin (staff act in Zendesk
  // directly, not as the client).
  newRequest: ['alloy:admin', 'client:owner', 'client:staff', 'client:accounting'],

  // The Admin panel (invite/manage users, sync health, analytics).
  adminPanel: ['alloy:admin', 'alloy:staff'],
  manageUsers: ['alloy:admin', 'client:owner'],

  // --- Phase 2 consumes the gates below; defined now so the matrix is the one
  // place to edit. Flip an entry to change access (e.g. add 'client:accounting'
  // to screen_leads to give Accounting lead access). ---
  screen_leads: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:staff'],
  screen_projects: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:staff'],
  screen_roadmap: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:staff'],
  // Monthly snapshot is now an internal/admin tool (clients see "Visibility"
  // instead) — staff-only.
  screen_snapshot: ['alloy:admin', 'alloy:staff'],
  screen_performance: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:staff', 'client:accounting'],
  screen_roi: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:accounting'],
  partnershipValue: ['alloy:admin', 'alloy:staff', 'client:owner', 'client:accounting'],
  billing: ['alloy:admin', 'client:owner', 'client:accounting'],
};

// Map a loaded user ({ isStaff, role }) to its identity key, normalizing any
// legacy role values that predate the canonical set.
export function roleKey(user) {
  const raw = (user && user.role) || 'owner';
  const role = raw === 'bd' || raw === 'ops' ? 'staff' : raw;
  const side = user && user.isStaff ? 'alloy' : 'client';
  return `${side}:${role}`;
}

// Does this user have the given capability?
export function can(user, cap) {
  const allowed = CAPS[cap];
  return !!allowed && allowed.includes(roleKey(user));
}
