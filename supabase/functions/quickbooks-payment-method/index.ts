import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Onboarding ACH capture. Lets a client store a bank account for autopay during
// onboarding. PCI-safe: raw bank details are tokenized in the browser (Intuit
// SDK) and never reach us — this function only receives the opaque token and
// attaches it to the client's QBO customer via the Payments API.
//
// Actions (JSON body { action }):
//   - get             → method on file for the caller's account (last-4 only)
//   - createCustomer  → ensure the account has a QBO customer (creates if missing)
//   - attach          → { token, accountName?, achAuthorized, agreementVersion }
//                       ensure customer → createFromToken → store ref + ACH auth
//
// Account-scoped; financial writes require billing-capable roles (admin / client
// owner / client accounting), mirroring perms.js `billing`. verify_jwt: true.
//
// Secrets: QBO_CLIENT_ID/SECRET, optional QBO_ENV. Connection from quickbooks_oauth.

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "70";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const sandbox = () => (Deno.env.get("QBO_ENV") || "").trim().toLowerCase() === "sandbox";
const acctBase = () => sandbox() ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
const payBase = () => sandbox() ? "https://sandbox.api.intuit.com" : "https://api.intuit.com";

// Valid access token from the stored (rotating) connection — refreshes when stale.
async function getAccessToken(db: any): Promise<{ token: string; realmId: string }> {
  const clientId = (Deno.env.get("QBO_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("QBO_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID/SECRET not set");

  const { data: row } = await db.from("quickbooks_oauth").select("*").limit(1).maybeSingle();
  if (!row) throw new Error("QBO not connected");

  if (row.access_token && row.access_token_expires_at &&
      new Date(row.access_token_expires_at).getTime() - Date.now() > 60_000) {
    return { token: row.access_token, realmId: row.realm_id };
  }
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
  await db.from("quickbooks_oauth").upsert({
    realm_id: row.realm_id,
    refresh_token: tok.refresh_token || row.refresh_token,
    access_token: tok.access_token,
    access_token_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "realm_id" });
  return { token: tok.access_token, realmId: row.realm_id };
}

// Ensure the account has a QBO customer; create one (Accounting API) if missing.
// Returns the QBO customer id, persisting it to accounts.quickbooks_customer_id.
async function ensureCustomer(db: any, token: string, realmId: string, account: any, contact: any): Promise<string> {
  if (account.quickbooks_customer_id) return String(account.quickbooks_customer_id);

  const displayName = (contact?.displayName || account.company || "").trim();
  if (!displayName) throw new Error("cannot create QBO customer: no company name");
  const payload: Record<string, unknown> = { DisplayName: displayName, CompanyName: account.company || displayName };
  if (contact?.email) payload.PrimaryEmailAddr = { Address: String(contact.email) };

  const url = `${acctBase()}/v3/company/${realmId}/customer?minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
  });

  let customerId: string | null = null;
  if (res.ok) {
    customerId = String((await res.json())?.Customer?.Id);
  } else {
    // Duplicate name (6240): fall back to the existing customer with that name.
    const text = await res.text();
    if (/6240|Duplicate Name/i.test(text)) {
      const q = `SELECT Id FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
      const qr = await fetch(`${acctBase()}/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=${MINOR_VERSION}`,
        { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });
      customerId = String((await qr.json())?.QueryResponse?.Customer?.[0]?.Id || "");
    }
    if (!customerId) throw new Error(`QBO customer create ${res.status}: ${text}`);
  }

  await db.from("accounts").update({ quickbooks_customer_id: customerId }).eq("id", account.id);
  return customerId;
}

function last4Of(masked: unknown): string | null {
  const d = String(masked || "").replace(/\D/g, "");
  return d ? d.slice(-4) : null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: me } = await userClient
      .from("profiles").select("account_id, is_staff, role").eq("id", user.id).maybeSingle();
    if (!me?.account_id) return json({ error: "forbidden" }, 403);

    // billing-capable: Alloy staff, or client owner/accounting (mirrors perms.js).
    const billingOk = me.is_staff || me.role === "owner" || me.role === "accounting";

    const body = await req.json().catch(() => ({}));
    const action = body.action || "get";

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "get") {
      const { data } = await db.from("quickbooks_payment_methods")
        .select("last4, account_name, bank_name, account_type, verification_status, is_default, ach_authorized_at, created_at")
        .eq("account_id", me.account_id).order("created_at", { ascending: false });
      return json({ methods: data || [] });
    }

    if (!billingOk) return json({ error: "forbidden: billing role required" }, 403);

    const { data: account } = await db.from("accounts")
      .select("id, company, quickbooks_customer_id").eq("id", me.account_id).maybeSingle();
    if (!account) return json({ error: "account not found" }, 404);

    const { token, realmId } = await getAccessToken(db);

    if (action === "createCustomer") {
      const customerId = await ensureCustomer(db, token, realmId, account, body.contact || {});
      return json({ ok: true, quickbooksCustomerId: customerId });
    }

    if (action === "attach") {
      const token2 = String(body.token || "").trim();   // opaque bank token from the browser
      if (!token2) return json({ error: "token required" }, 400);
      if (!body.achAuthorized) return json({ error: "ACH authorization required" }, 400);

      const customerId = await ensureCustomer(db, token, realmId, account, body.contact || {});

      // Attach the tokenized bank account to the customer (Payments API).
      const res = await fetch(`${payBase()}/quickbooks/v4/customers/${customerId}/bank-accounts/createFromToken`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Request-Id": crypto.randomUUID(),    // Payments idempotency key
        },
        body: JSON.stringify({ token: token2 }),
      });
      if (!res.ok) return json({ error: `QBO bank attach ${res.status}: ${(await res.text()).slice(0, 500)}` }, 502);
      const bank = await res.json();

      const row = {
        account_id: account.id,
        qbo_bank_account_id: String(bank.id),
        last4: last4Of(bank.accountNumber),
        account_name: body.accountName || bank.name || null,
        bank_name: bank.bankName || null,
        account_type: bank.accountType || null,
        verification_status: bank.verificationStatus || null,
        is_default: bank.default !== false,
        ach_authorized_at: new Date().toISOString(),
        ach_authorized_by: user.id,
        ach_agreement_version: body.agreementVersion || "v1",
      };
      const { error: insErr } = await db.from("quickbooks_payment_methods")
        .upsert(row, { onConflict: "account_id, qbo_bank_account_id" });
      if (insErr) throw insErr;

      return json({ ok: true, method: { last4: row.last4, bankName: row.bank_name, accountType: row.account_type } });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
