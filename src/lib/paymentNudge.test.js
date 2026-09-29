import { describe, it, expect } from 'vitest';
import {
  shouldNudgePayment, isValidRoutingNumber, validateBankForm, bankTokenPayload,
  isNudgeSnoozed, snoozeNudge, achAgreementText, ACH_AGREEMENT_VERSION,
} from './paymentNudge.js';

const owner = { id: 'u1', role: 'owner', isStaff: false };
const acct = { id: 'a1', autopayRequired: true };
const pm = { last4: '3913', bankName: 'FIRST CITIZENS' };

describe('shouldNudgePayment', () => {
  it('nudges a client owner with no bank on file', () => {
    expect(shouldNudgePayment({ user: owner, account: acct, paymentMethod: null })).toBe(true);
  });
  it('nudges a client accounting user too (billing role)', () => {
    expect(shouldNudgePayment({ user: { ...owner, role: 'accounting' }, account: acct, paymentMethod: null })).toBe(true);
  });
  it('never nudges a client staff-role user (cannot act on it)', () => {
    expect(shouldNudgePayment({ user: { ...owner, role: 'staff' }, account: acct, paymentMethod: null })).toBe(false);
  });
  it('never nudges Alloy staff browsing a client', () => {
    expect(shouldNudgePayment({ user: { ...owner, isStaff: true, role: 'admin' }, account: acct, paymentMethod: null })).toBe(false);
  });
  it('stops once a bank is on file', () => {
    expect(shouldNudgePayment({ user: owner, account: acct, paymentMethod: pm })).toBe(false);
  });
  it('respects the admin exemption (autopayRequired false)', () => {
    expect(shouldNudgePayment({ user: owner, account: { ...acct, autopayRequired: false }, paymentMethod: null })).toBe(false);
  });
  it('treats a missing flag as required (default on for new clients)', () => {
    expect(shouldNudgePayment({ user: owner, account: { id: 'a1' }, paymentMethod: null })).toBe(true);
  });
  it('is quiet with no signed-in user or account', () => {
    expect(shouldNudgePayment({})).toBe(false);
    expect(shouldNudgePayment({ user: owner, account: null })).toBe(false);
  });
});

describe('isValidRoutingNumber (ABA checksum)', () => {
  it('accepts real routing numbers', () => {
    expect(isValidRoutingNumber('021000021')).toBe(true);   // JPMorgan Chase
    expect(isValidRoutingNumber('322079353')).toBe(true);   // Intuit sandbox test bank
    expect(isValidRoutingNumber('0210-0002-1')).toBe(true); // tolerates separators
  });
  it('rejects bad length or checksum', () => {
    expect(isValidRoutingNumber('123456789')).toBe(false);
    expect(isValidRoutingNumber('02100002')).toBe(false);
    expect(isValidRoutingNumber('')).toBe(false);
    expect(isValidRoutingNumber(null)).toBe(false);
  });
});

const good = { name: 'CMGT Operating', routing: '021000021', account: '000123456789', confirm: '000123456789', accountType: 'BUSINESS_CHECKING', phone: '(555) 010-2030', agree: true };

describe('validateBankForm', () => {
  it('passes a complete form', () => {
    expect(validateBankForm(good)).toEqual({ ok: true, errors: {} });
  });
  it('flags a mismatched confirmation, not the account itself', () => {
    const r = validateBankForm({ ...good, confirm: '000123456780' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(['confirm']);
  });
  it('flags every missing piece at once', () => {
    const r = validateBankForm({ agree: false });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['account', 'accountType', 'agree', 'name', 'phone', 'routing']);
  });
  it('enforces the 4–17 digit account range', () => {
    expect(validateBankForm({ ...good, account: '123', confirm: '123' }).errors.account).toBeTruthy();
    expect(validateBankForm({ ...good, account: '1'.repeat(18), confirm: '1'.repeat(18) }).errors.account).toBeTruthy();
  });
  it('requires the ACH authorization', () => {
    expect(validateBankForm({ ...good, agree: false }).errors.agree).toBeTruthy();
  });
});

describe('bankTokenPayload', () => {
  it('sends Intuit digits only, trimmed name, and the chosen type', () => {
    expect(bankTokenPayload({ ...good, name: '  CMGT Operating ' })).toEqual({
      bankAccount: { name: 'CMGT Operating', routingNumber: '021000021', accountNumber: '000123456789', accountType: 'BUSINESS_CHECKING', phone: '5550102030' },
    });
  });
});

describe('snooze (remind me later)', () => {
  it('is per-store and tolerates a missing store', () => {
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) };
    expect(isNudgeSnoozed(store)).toBe(false);
    snoozeNudge(store);
    expect(isNudgeSnoozed(store)).toBe(true);
    expect(isNudgeSnoozed(undefined)).toBe(false);
    expect(() => snoozeNudge(undefined)).not.toThrow();
  });
});

describe('ACH agreement', () => {
  it('names the company and carries a version', () => {
    expect(achAgreementText('CMGT')).toMatch(/CMGT’s recurring monthly/);
    expect(achAgreementText('')).toMatch(/my company’s/);
    expect(ACH_AGREEMENT_VERSION).toBe('v1');
  });
});
