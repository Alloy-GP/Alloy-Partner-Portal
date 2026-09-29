import { can } from './perms.js';

// Autopay onboarding nudge — the pure logic behind the sign-in modal, the
// persistent banner, and the Account page empty state. No React, no Supabase,
// so it is unit-tested in paymentNudge.test.js.

// Bump when the authorization wording changes. Stored per attach as
// quickbooks_payment_methods.ach_agreement_version so we can prove which text
// a client accepted (NACHA requires a record of the authorization).
export const ACH_AGREEMENT_VERSION = 'v1';

export function achAgreementText(company) {
  const who = String(company || '').trim() || 'my company';
  return `I authorize Alloy Growth Partners to debit the bank account above by ACH for ${who}’s recurring monthly Alloy fees on or about the 1st of each month, and to credit the account to correct any erroneous debit. This authorization stays in effect until I cancel it in writing, giving Alloy at least 10 business days before the next scheduled draft.`;
}

// Should this signed-in user be nudged to add a bank account?
//  - clients only — staff browsing a client are never nagged
//  - billing roles only (owner / accounting): the same roles the attach
//    endpoint accepts. A client "staff" user can't act on it, so don't ask.
//  - the account must want autopay (Admin can exempt an account)
//  - and there is no bank on file yet
export function shouldNudgePayment({ user, account, paymentMethod } = {}) {
  if (!user || !user.id) return false;
  if (user.isStaff) return false;
  if (!can(user, 'billing')) return false;
  if (!account || account.autopayRequired === false) return false;
  return !paymentMethod;
}

// "Remind me later" — snoozed for the browser session only (sessionStorage
// clears when the tab closes), so the modal returns on the next sign-in.
const SNOOZE_KEY = 'alloy_pm_nudge_snoozed';
export function isNudgeSnoozed(store = globalThis.sessionStorage) {
  try { return !!(store && store.getItem(SNOOZE_KEY)); } catch { return false; }
}
export function snoozeNudge(store = globalThis.sessionStorage) {
  try { if (store) store.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* private mode */ }
}

// --- bank form ---------------------------------------------------------------
// accountType values are Intuit's (Payments API BankAccount.accountType).
export const ACCOUNT_TYPES = [
  { value: 'BUSINESS_CHECKING', label: 'Business checking' },
  { value: 'BUSINESS_SAVINGS', label: 'Business savings' },
  { value: 'PERSONAL_CHECKING', label: 'Personal checking' },
  { value: 'PERSONAL_SAVINGS', label: 'Personal savings' },
];

export const digitsOnly = (s) => String(s || '').replace(/\D/g, '');

// ABA routing number: 9 digits whose weighted sum
// 3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9) is a multiple of 10.
export function isValidRoutingNumber(s) {
  const d = digitsOnly(s);
  if (d.length !== 9) return false;
  const n = d.split('').map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

// Validate the modal's form. Returns { ok, errors: { field: message } }.
export function validateBankForm(form = {}) {
  const errors = {};
  const name = String(form.name || '').trim();
  const routing = digitsOnly(form.routing);
  const account = digitsOnly(form.account);
  const confirm = digitsOnly(form.confirm);
  const phone = digitsOnly(form.phone);
  if (name.length < 2) errors.name = 'Enter the name on the bank account.';
  if (!isValidRoutingNumber(routing)) errors.routing = 'Enter a valid 9-digit routing number.';
  if (account.length < 4 || account.length > 17) errors.account = 'Account numbers are 4 to 17 digits.';
  else if (account !== confirm) errors.confirm = 'Account numbers don’t match.';
  if (!ACCOUNT_TYPES.some((t) => t.value === form.accountType)) errors.accountType = 'Choose an account type.';
  if (phone.length < 10) errors.phone = 'Enter a phone number for the account holder.';
  if (!form.agree) errors.agree = 'Please authorize ACH debits to continue.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// The exact payload Intuit's tokens endpoint expects. Raw numbers go from the
// browser straight to Intuit — never to Supabase.
export function bankTokenPayload(form = {}) {
  return {
    bankAccount: {
      name: String(form.name || '').trim(),
      routingNumber: digitsOnly(form.routing),
      accountNumber: digitsOnly(form.account),
      accountType: form.accountType,
      phone: digitsOnly(form.phone),
    },
  };
}
