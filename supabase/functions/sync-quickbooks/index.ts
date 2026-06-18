import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs QuickBooks Online billing documents — both Invoices and SalesReceipts
// (clients use one or the other) — into the portal's `invoices` table, per
// account (accounts.quickbooks_customer_id holds a QBO Customer.Id). Mirrors
// sync-whatconverts: per-account clear-then-insert. PDFs are NOT stored —
// they're fetched on demand by quickbooks-invoice-pdf.
//
// OAuth: a single connection to Alloy's own QBO company. The refresh token
// rotates on every refresh, so it lives in the `quickbooks_oauth` table (not an
// env secret). First run seeds that table from QBO_REFRESH_TOKEN + QBO_REALM_ID.
//
// Secrets: QBO_CLIENT_ID, QBO_CLIENT_SECRET, optional QBO_ENV ('sandbox' |
// 'production', default production), and one-time bootstrap QBO_REFRESH_TOKEN +
// QBO_REALM_ID. Trigger: manual / nightly cron / on profile save. Optional
// ?secret=SYNC_SECRET.

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "70";
const PAGE = 200;          // QBO query MAXRESULTS cap is 1000; 200 is plenty/page
const MAX_PAGES = 25;      // safety backstop (5k invoices/account)

function apiBase(): string {
  return (Deno.env.get("QBO_ENV") || "").trim().toLowerCase() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

// --- OAuth token management ------------------------------------------------
// Refresh the access token using the stored (rotating) refresh token, persist
// the new pair, and return a valid access token. Reuses the cached access token
// while it's still good to avoid needlessly rotating the refresh token.
async function getAccessToken(db: any): Promise<{ token: string; realmId: string }> {
  const clientId = (Deno.env.get("QBO_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("QBO_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID/SECRET not set");

  let { data: row } = await db.from("quickbooks_oauth").select("*").limit(1).maybeSingle();

  // First run: seed from the one-time bootstrap secrets.
  if (!row) {
    const seedRefresh = (Deno.env.get("QBO_REFRESH_TOKEN") || "").trim();
    const seedRealm = (Deno.env.get("QBO_REALM_ID") || "").trim();
    if (!seedRefresh || !seedRealm) {
      throw new Error("No QBO connection stored and QBO_REFRESH_TOKEN/QBO_REALM_ID not set to bootstrap");
    }
    row = { realm_id: seedRealm, refresh_token: seedRefresh, access_token: null, access_token_expires_at: null };
  }

  // Cached access token still valid (>60s headroom)? Use it.
  if (row.access_token && row.access_token_expires_at &&
      new Date(row.access_token_expires_at).getTime() - Date.now() > 60_000) {
    return { token: row.access_token, realmId: row.realm_id };
  }

  // Otherwise refresh. QBO re-issues the refresh token — persist the new one.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(row.refresh_token)}`,
  });
  if (!res.ok) throw new Error(`QBO token refresh ${res.status}: ${await res.text()}`);
  const tok = await res.json();
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();

  await db.from("quickbooks_oauth").upsert({
    realm_id: row.realm_id,
    refresh_token: tok.refresh_token || row.refresh_token,   // re-issued each time
    access_token: tok.access_token,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "realm_id" });

  return { token: tok.access_token, realmId: row.realm_id };
}

// --- Billing-document query + mapping --------------------------------------
// Clients bill via either Invoice (A/R, has balance) or SalesReceipt (paid at
// sale, no balance). We pull BOTH per customer and store them tagged by type.
async function fetchDocs(base: string, realmId: string, token: string, customerId: string, entity: string): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const start = i * PAGE + 1;   // QBO STARTPOSITION is 1-based
    const q = `SELECT * FROM ${entity} WHERE CustomerRef = '${customerId}' ORDERBY TxnDate DESC STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=${MINOR_VERSION}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });
    if (!res.ok) throw new Error(`QBO ${entity} query ${res.status}: ${await res.text()}`);
    const batch = (await res.json())?.QueryResponse?.[entity] || [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

// List all QBO customers (Id + DisplayName) — used to auto-match portal accounts
// to QBO customer ids without hand-copying each nameId. Body { listCustomers:true }.
async function fetchCustomers(base: string, realmId: string, token: string): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const start = i * PAGE + 1;
    const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(
      `SELECT Id, DisplayName, CompanyName, Active, Job, ParentRef FROM Customer STARTPOSITION ${start} MAXRESULTS ${PAGE}`,
    )}&minorversion=${MINOR_VERSION}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });
    if (!res.ok) throw new Error(`QBO customer query ${res.status}: ${await res.text()}`);
    const batch = (await res.json())?.QueryResponse?.Customer || [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.map((c: any) => ({ id: String(c.Id), name: c.DisplayName || c.CompanyName || "", active: c.Active !== false, job: c.Job === true, parent: c?.ParentRef?.value ? String(c.ParentRef.value) : null }));
}

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// Tidy a single line's description: drop "– Detail: <url>" tails and stray URLs.
function cleanLineDesc(s: unknown): string {
  let t = String(s || "").trim();
  t = t.split(/\s+[–—-]\s*Detail\s*:/i)[0];      // strip "— Detail: https://…" tail
  t = t.replace(/https?:\/\/\S+/g, "").trim();   // strip any stray URL
  return t.replace(/[·\-–—\s]+$/, "").trim();    // trailing punctuation/space
}

// Summary of ALL line items (description preferred, item name fallback), deduped
// and joined — the one-line summary the Account page shows in the Description column.
function summarizeLines(doc: any): string | null {
  const parts: string[] = [];
  for (const ln of (Array.isArray(doc.Line) ? doc.Line : [])) {
    if (ln.DetailType !== "SalesItemLineDetail") continue;
    const d = cleanLineDesc(ln.Description) || String(ln.SalesItemLineDetail?.ItemRef?.name || "").trim();
    if (d && !parts.includes(d)) parts.push(d);
  }
  if (!parts.length) return null;
  let out = parts.join(" · ");
  if (out.length > 140) out = out.slice(0, 137).trimEnd() + "…";
  return out;
}

// QBO has no single "status" field — derive it from balance + due date.
function invoiceStatus(inv: any, balance: number): string {
  if (inv?.Void === true || /void/i.test(String(inv?.PrivateNote || ""))) return "void";
  if (balance <= 0) return "paid";
  const due = inv?.DueDate ? new Date(`${inv.DueDate}T00:00:00Z`).getTime() : null;
  if (due != null && due < Date.now()) return "overdue";
  return "open";
}

// Map a billing document of either type. Sales receipts are always paid (no
// balance, no due date); invoices carry A/R.
function mapDoc(doc: any, acctId: string, docType: string) {
  const isReceipt = docType === "sales_receipt";
  const balance = isReceipt ? 0 : num(doc.Balance);
  return {
    account_id: acctId,
    doc_type: docType,
    qbo_invoice_id: String(doc.Id),
    doc_number: doc.DocNumber ? String(doc.DocNumber) : null,
    description: summarizeLines(doc),
    txn_date: doc.TxnDate || null,
    due_date: isReceipt ? null : (doc.DueDate || null),
    total_amount: num(doc.TotalAmt),
    balance,
    status: isReceipt ? "paid" : invoiceStatus(doc, balance),
    currency: doc?.CurrencyRef?.value || "USD",
    synced_at: new Date().toISOString(),
  };
}

async function syncAccount(db: any, base: string, realmId: string, token: string, acct: any) {
  const cid = acct.quickbooks_customer_id;
  const [invoices, receipts] = await Promise.all([
    fetchDocs(base, realmId, token, cid, "Invoice"),
    fetchDocs(base, realmId, token, cid, "SalesReceipt"),
  ]);
  const rows = [
    ...invoices.map((d) => mapDoc(d, acct.id, "invoice")),
    ...receipts.map((d) => mapDoc(d, acct.id, "sales_receipt")),
  ]
    // newest first across both types
    .sort((a, b) => String(b.txn_date || "").localeCompare(String(a.txn_date || "")))
    .map((r, i) => ({ ...r, sort: i }));

  // Mirror QBO for this account: clear then insert (matches sync-whatconverts).
  const { error: delErr } = await db.from("invoices").delete().eq("account_id", acct.id);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
  if (rows.length) {
    const { error: insErr } = await db.from("invoices").insert(rows);
    if (insErr) throw new Error(`insert: ${insErr.message}`);
  }
  return { invoices: invoices.length, receipts: receipts.length };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const secret = Deno.env.get("SYNC_SECRET");
    if (secret && url.searchParams.get("secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { token, realmId } = await getAccessToken(db);
    const base = apiBase();

    // Discovery mode: return the QBO customer list for account matching.
    if (body.listCustomers) {
      return Response.json({ ok: true, customers: await fetchCustomers(base, realmId, token) });
    }

    const onlyAccount = body.accountId ? String(body.accountId) : null;

    const { data: accounts, error } = await db
      .from("accounts").select("id, short_name, company, quickbooks_customer_id")
      .not("quickbooks_customer_id", "is", null);
    if (error) throw error;

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (onlyAccount && acct.id !== onlyAccount) continue;
      if (!acct.quickbooks_customer_id) continue;
      try {
        const n = await syncAccount(db, base, realmId, token, acct);
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: true, invoices: n.invoices, receipts: n.receipts });
      } catch (e) {
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const failed = summary.filter((s) => !s.ok).length;
    return Response.json({ ok: failed === 0, synced: summary.length - failed, failed, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
