// ============================================================================
// Who the proposal system belongs to — SINGLE SOURCE OF TRUTH.
//
// Proposals is a CMGT-only pilot. CMGT is the ONE account that runs it, and that
// fact gates three separate things which must never disagree:
//   1. the sidebar entry           (src/components/shell.jsx)
//   2. the /proposals route        (src/App.jsx)
//   3. whether intake MINTS rows   (src/components/screen-proposals.jsx drain)
//
// (3) is not cosmetic. The drain writes a proposal row per eligible WhatConverts
// lead for whatever account is open, so staff opening another client's proposals
// URL silently manufactured a pipeline for a client that doesn't run proposals —
// that is how Edison ended up with 90 rows and Tidewater with 6. Minting is now
// gated on the same predicate as access.
//
// Deliberately NOT gated on accounts.proposals_enabled. That column was the old
// gate and its data does not match reality: CMGT's flag is false while the
// (deleted) Northstar demo account's was the only true one. A gate that depends
// on a column nothing reliably maintains fails silently and in the worst
// direction — it locks the real pilot client out. The column is kept as an
// informational marker for the Admin → Proposals list; access is this allowlist.
//
// Alloy STAFF keep access to the cockpit on any account they view (they run it on
// the client's behalf). App.jsx folds "View as client" into DATA.user.isStaff, so
// that QA mode is gated as a client here for free.
// ============================================================================

// CMGT's portal account. Matched on the id OR the short name: the id is belt,
// short_name is braces, so neither a renamed account nor a re-created row
// silently drops the pilot. Both verified against the live DB.
export const CMGT_ACCOUNT_ID = '5126f05a-c6b9-49c5-b9e3-364a2e2c76ad';
export const CMGT_SHORT_NAME = 'CMGT';

// Is this the CMGT account? (`account` is the loadData shape: { id, shortName }.)
export function isCmgtAccount(account) {
  if (!account) return false;
  if (account.id && account.id === CMGT_ACCOUNT_ID) return true;
  return String(account.shortName || '').trim().toUpperCase() === CMGT_SHORT_NAME;
}

// Does this account run the proposal system at all? The one predicate behind
// access AND minting. Today that is exactly "is it CMGT".
export function isProposalsAccount(account) {
  return isCmgtAccount(account);
}

// What a CLIENT user is allowed: only CMGT's own people.
export function clientCanSeeProposals(account) {
  return isProposalsAccount(account);
}

// The gate the sidebar and the route both consume.
export function canSeeProposals(user, account) {
  if (user && user.isStaff) return true;
  return clientCanSeeProposals(account);
}

// May intake mint proposal rows for this account? Staff-agnostic ON PURPOSE:
// a staffer browsing another client's cockpit must not create data there.
export function canMintProposals(account) {
  return isProposalsAccount(account);
}
