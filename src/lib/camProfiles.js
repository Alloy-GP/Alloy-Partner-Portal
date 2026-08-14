// ============================================================================
// CAM profiles — the white-label identity behind the proposal system, per
// account. Everything a prospect could read as "which management company is
// this" lives here: name, logo, contact, team, tiers, onboarding, UVPs, and the
// per-concern prose. The board doc (board-proposal.jsx), the cockpit
// (screen-proposals.jsx), and the matcher (enrichLead) all read a profile via
// `camFor(accountId)` instead of hardcoding one company.
//
// CMGT is the only CAM today (proposals is a CMGT-only pilot — see
// src/lib/proposalAccess.js), assembled from the boardData/proposalMockData
// constants. `camFor` keeps the per-account lookup shape so onboarding a second
// CAM is adding one entry to PROFILES, not rewiring every surface.
// ============================================================================

import {
  UVPS as CMGT_UVPS,
  TIERS as CMGT_TIERS,
  TEAM as CMGT_TEAM,
  ONBOARDING_TIMELINE as CMGT_ONBOARDING,
} from './boardData.js';
// painProse + includes come from proposalMockData — that's the exact source
// enrichLead() already uses, so passing the CMGT profile changes nothing for CMGT.
import { INCLUDES as CMGT_INCLUDES, PAIN_PROSE as CMGT_PAIN_PROSE } from './proposalMockData.js';

// ---------------------------------------------------------------------------
// CMGT — the real pilot CAM. Wraps today's constants (nothing changes for it).
// ---------------------------------------------------------------------------
const CMGT_PROFILE = {
  key: 'cmgt',
  name: 'CMGT',
  shortName: 'CMGT',
  fullName: 'Community Management, LLC',
  tagline: 'We Manage. You Live.',
  logo: { light: '/proposal-assets/cmgt-logo.svg', dark: '/proposal-assets/cmgt-logo-white.svg' },
  contact: { web: 'cmgt.org', email: 'proposals@cmgt.org', phone: '(225) 791-1505' },
  team: CMGT_TEAM,
  tiers: CMGT_TIERS,
  onboarding: CMGT_ONBOARDING,
  includes: CMGT_INCLUDES,
  uvps: CMGT_UVPS,
  painProse: CMGT_PAIN_PROSE,
  // owner initials → the person the board hears from
  reps: {
    AB: { name: 'Amanda Betancourt', first: 'Amanda', role: 'COO' },
    JR: { name: 'Jordan R.', first: 'Jordan', role: 'Client Partnerships' },
  },
  ownerShort: { AB: 'Amanda B.', JR: 'Jordan R.' },
  ownerFirst: { AB: 'Amanda', JR: 'Jordan' },
  preparedBy: { name: 'Amanda Betancourt', role: 'COO' },
  discoveryLead: 'Jeff Harman (CEO & founder)',
  discoveryLeadFirst: 'Jeff',
  emailFromName: 'CMGT Community Management',
  footerBlurb: 'Community association management for the Gulf South. Family-run since 2007. CAI member · CMCA-credentialed team.',
  office: ['140 Aspen Square, Suite H', 'Denham Springs, LA 70726'],
  legalName: 'Community Management, LLC',
};

// accountId → CAM profile. Empty while CMGT is the only one; every account
// therefore resolves to the default below.
const PROFILES = {};

export const DEFAULT_CAM = CMGT_PROFILE;

// Resolve the CAM identity for an account. Unknown/absent → CMGT.
export function camFor(accountId) {
  return (accountId && PROFILES[accountId]) || DEFAULT_CAM;
}
