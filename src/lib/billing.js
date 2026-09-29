import { supabase } from './supabase.js';
import { DATA } from '../data.js';

// Download a single QuickBooks invoice PDF. The edge function is account-scoped
// (a client may only fetch invoices on their own account) and streams the PDF
// back as an attachment, so we fetch it directly (functions.invoke mangles
// binary) and trigger a browser download from the blob.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-invoice-pdf`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function downloadInvoice(invoiceId, filename) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invoiceId }),
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* non-json */ }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || `invoice-${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

// ── Autopay onboarding: bank-account capture ─────────────────────────────────
// PCI-safe flow: the browser POSTs the raw bank details straight to Intuit's
// tokens endpoint (unauthenticated by design — verified: it returns a token
// with no OAuth header) and gets an opaque token. Only that token reaches our
// `quickbooks-payment-method` function (`attach`), which stores the QBO
// bank-account reference + last-4 and the NACHA authorization record.

// Call the payment function and surface OUR error message on a non-2xx (the
// supabase client hides the body behind error.context).
export async function invokePayment(body) {
  const { data, error } = await supabase.functions.invoke('quickbooks-payment-method', { body });
  if (error) {
    let msg = error.message || 'Payment service unavailable';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

// Which Intuit host to tokenize against. The function owns QBO_ENV, so the
// browser can never drift from it (a sandbox token is useless in production).
export async function fetchPaymentConfig() {
  const cfg = await invokePayment({ action: 'config' });
  if (!cfg.tokenUrl) throw new Error('Payment setup is not available right now.');
  return cfg;
}

// Raw bank details → Intuit → opaque token. Never touches Supabase.
export async function tokenizeBankAccount(tokenUrl, payload) {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Request-Id': crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.value) {
    const first = body && body.errors && body.errors[0];
    throw new Error((first && first.message) || `Your bank details couldn’t be verified (${res.status}). Check the numbers and try again.`);
  }
  return body.value;
}

// Token → QBO bank account on the client's customer + our method-on-file row.
export async function attachBankAccount({ token, accountName, agreementVersion }) {
  const data = await invokePayment({
    action: 'attach', token, accountName, achAuthorized: true, agreementVersion,
    contact: { email: (DATA.user && DATA.user.email) || undefined },
  });
  if (!data.ok || !data.method) throw new Error('Your bank account could not be saved. Please try again.');
  return data.method; // { last4, bankName, accountType, verificationStatus }
}
