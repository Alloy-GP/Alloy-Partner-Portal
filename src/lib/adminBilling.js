import { supabase } from './supabase.js';
import { invokePayment } from './billing.js';

// Staff-side autopay controls (Admin → client → Autopay). Reads go straight to
// the tables (RLS: staff read any account); writes go through the staff-only
// actions on `quickbooks-payment-method`. Alloy sets what is billed — a client
// never can. Pure helpers at the bottom are unit-tested (adminBilling.test.js).

export async function getAccountBilling(accountId) {
  const [m, s] = await Promise.all([
    supabase.from('quickbooks_payment_methods')
      .select('bank_name, account_type, last4, verification_status, ach_authorized_at, ach_agreement_version, created_at')
      .eq('account_id', accountId).order('created_at', { ascending: false }),
    supabase.from('autopay_schedules').select('*').eq('account_id', accountId).maybeSingle(),
  ]);
  if (m.error) throw m.error;
  if (s.error) throw s.error;
  return { method: (m.data || [])[0] || null, schedule: s.data || null };
}

// QuickBooks service items (what the draft bills against).
export async function listBillingItems() {
  const r = await invokePayment({ action: 'listItems' });
  return r.items || [];
}

// Create the Automated ACH recurring sales receipt in QuickBooks + our schedule
// row. Returns { recurringId, firstChargeDate, total, note }.
export function startAutopay({ accountId, amount, itemId, dayOfMonth, startDate, description }) {
  return invokePayment({
    action: 'createRecurring', accountId, amount: Number(amount), itemId, dayOfMonth: Number(dayOfMonth),
    startDate: startDate || undefined, description: description || undefined,
  });
}

// Delete the QuickBooks template + our schedule row.
export function stopAutopay(recurringId) {
  return invokePayment({ action: 'deleteRecurring', recurringId });
}

// --- pure ------------------------------------------------------------------
// Earliest allowed first draft = 1st of next month (UTC, same rule as the edge
// function): QuickBooks always creates templates ACTIVE, so this is the window
// in which someone verifies the template before money moves.
export function firstOfNextMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export function validateAutopayForm(form = {}, now = new Date()) {
  const errors = {};
  if (!(Number(form.amount) > 0)) errors.amount = 'Enter the monthly amount.';
  if (!form.itemId) errors.itemId = 'Pick the QuickBooks service item to bill against.';
  const day = Number(form.dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 28) errors.dayOfMonth = 'Day must be 1–28 (every month has it).';
  const min = firstOfNextMonth(now);
  if (form.startDate && String(form.startDate) < min) errors.startDate = `First draft can’t be before ${min} — verify the template in QuickBooks before money moves.`;
  return { ok: Object.keys(errors).length === 0, errors };
}

export const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const ordinal = (n) => { const d = Number(n) || 1, s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); };
