import { supabase } from './supabase.js';

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
