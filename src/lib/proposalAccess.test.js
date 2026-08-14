import { describe, it, expect } from 'vitest';
import {
  CMGT_ACCOUNT_ID,
  isCmgtAccount,
  isProposalsAccount,
  clientCanSeeProposals,
  canSeeProposals,
  canMintProposals,
} from './proposalAccess.js';

// NB: proposalsEnabled is present on these fixtures purely to prove it is NOT
// consulted. The live DB has CMGT's flag false and only the demo account's true,
// so a gate that required it would have locked the real pilot client out.
const CMGT = { id: CMGT_ACCOUNT_ID, shortName: 'CMGT', proposalsEnabled: false };
const EDISON = { id: '0672a818-8470-4b6f-bfb0-db53896d7758', shortName: 'Edison', proposalsEnabled: true };
const client = { isStaff: false, role: 'owner' };
const staff = { isStaff: true, role: 'admin' };

describe('isCmgtAccount', () => {
  it('matches on the account id', () => {
    expect(isCmgtAccount({ id: CMGT_ACCOUNT_ID })).toBe(true);
  });
  it('matches on short_name even if the id changed', () => {
    expect(isCmgtAccount({ id: 'some-other-id', shortName: 'cmgt' })).toBe(true);
    expect(isCmgtAccount({ shortName: '  CMGT  ' })).toBe(true);
  });
  it('rejects every other account, and missing input', () => {
    expect(isCmgtAccount(EDISON)).toBe(false);
    expect(isCmgtAccount(null)).toBe(false);
    expect(isCmgtAccount({})).toBe(false);
    expect(isCmgtAccount({ shortName: undefined, id: undefined })).toBe(false);
  });
});

describe('clientCanSeeProposals', () => {
  it('lets CMGT in even though its proposals_enabled flag is false', () => {
    expect(clientCanSeeProposals(CMGT)).toBe(true);
  });
  it('keeps another client out even when its proposals_enabled flag is true', () => {
    expect(clientCanSeeProposals(EDISON)).toBe(false);
  });
  it('is safe on a missing account', () => {
    expect(clientCanSeeProposals(null)).toBe(false);
  });
});

describe('canSeeProposals', () => {
  it('gives Alloy staff the cockpit on any account', () => {
    expect(canSeeProposals(staff, EDISON)).toBe(true);
    expect(canSeeProposals(staff, CMGT)).toBe(true);
  });
  it('gates clients to CMGT', () => {
    expect(canSeeProposals(client, CMGT)).toBe(true);
    expect(canSeeProposals(client, EDISON)).toBe(false);
  });
  // App.jsx sets DATA.user.isStaff = realStaff && !viewAsClient, so "View as
  // client" arrives here as a client and must be gated like one.
  it('treats a staffer in view-as-client mode as a client', () => {
    expect(canSeeProposals({ isStaff: false }, EDISON)).toBe(false);
    expect(canSeeProposals({ isStaff: false }, CMGT)).toBe(true);
  });
  it('is safe with no user or account', () => {
    expect(canSeeProposals(null, null)).toBe(false);
  });
});

describe('canMintProposals', () => {
  it('allows minting only on the proposals account', () => {
    expect(canMintProposals(CMGT)).toBe(true);
    expect(canMintProposals(EDISON)).toBe(false);
    expect(canMintProposals(null)).toBe(false);
  });
  // The whole point: a staffer opening another client's cockpit must not
  // manufacture a pipeline there. This is what put 90 rows on Edison.
  it('is staff-agnostic — it takes no user at all', () => {
    expect(canMintProposals.length).toBe(1);
  });
});

describe('isProposalsAccount', () => {
  it('is the shared predicate behind access and minting', () => {
    expect(isProposalsAccount(CMGT)).toBe(true);
    expect(isProposalsAccount(EDISON)).toBe(false);
  });
});
