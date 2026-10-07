import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// QuickBooks payment + autopay setup for onboarding.
//
// Client actions (billing-capable role, own account):
//   - get             → bank method on file for the caller's account (last-4 only)
//   - config          → which Intuit host the browser tokenizes against (env + tokenUrl)
//   - createCustomer  → ensure the account has a QBO customer (creates if missing)
//   - attach          → { token, accountName?, achAuthorized, agreementVersion }
//                       tokenized bank (browser) → createFromToken → store ref + ACH auth
//                       → emails BILLING_ALERT_TO (default admin@alloygp.co) so Alloy
//                         starts the autopay draft (Admin → client → Autopay)
//
// Staff actions (Alloy configures billing; clients never set their own price):
//   - inspectRecurring→ dump QBO recurring templates (shape reference)
//   - listItems       → QBO service items, for the billing item picker
//   - createRecurring → { accountId, amount, itemId, description?, dayOfMonth?,
//                         startDate? } create an Automated ACH sales-receipt template +
//                       save it to autopay_schedules. Always active in QBO (the API can't
//                       create inactive); first charge defaults to 1st of next month so
//                       Alloy verifies before money moves.
//   - deleteRecurring → { recurringId } remove a recurring template + its schedule row
//   - resendBankAlert → { accountId } re-send the bank-added email for the bank on file
//
// PCI: raw bank #s are tokenized in the browser and never reach us. verify_jwt: true.
// Secrets: QBO_CLIENT_ID/SECRET, optional QBO_ENV. Connection from quickbooks_oauth.

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "70";
const ACH_PAYMENT_METHOD = "10";        // QBO PaymentMethod "ACH" (auto-charges bank on file)
const UNDEPOSITED_FUNDS = "35";         // QBO "Undeposited Funds" account (matches existing templates)

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

const qboGet = (realmId: string, token: string, path: string) =>
  fetch(`${acctBase()}/v3/company/${realmId}/${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`,
    { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });

const qboPost = (realmId: string, token: string, path: string, payload: unknown) =>
  fetch(`${acctBase()}/v3/company/${realmId}/${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
  });

// Ensure the account has a QBO customer; create one (Accounting API) if missing.
async function ensureCustomer(db: any, token: string, realmId: string, account: any, contact: any): Promise<string> {
  if (account.quickbooks_customer_id) return String(account.quickbooks_customer_id);

  const displayName = (contact?.displayName || account.company || "").trim();
  if (!displayName) throw new Error("cannot create QBO customer: no company name");
  const payload: Record<string, unknown> = { DisplayName: displayName, CompanyName: account.company || displayName };
  if (contact?.email) payload.PrimaryEmailAddr = { Address: String(contact.email) };

  const res = await qboPost(realmId, token, "customer", payload);
  let customerId: string | null = null;
  if (res.ok) {
    customerId = String((await res.json())?.Customer?.Id);
  } else {
    const text = await res.text();
    if (/6240|Duplicate Name/i.test(text)) {
      const q = `SELECT Id FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
      const qr = await qboGet(realmId, token, `query?query=${encodeURIComponent(q)}`);
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

// Default schedule start = first of next month (UTC).
function firstOfNextMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

// --- "bank added" alert to Alloy ---------------------------------------------
// Nothing drafts until staff start autopay, so the moment a client's bank lands
// the team gets an email with everything needed and a link straight to
// Admin → client → Autopay. Never throws: a mail failure must not fail the attach.
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const BILLING_ALERT_TO = (Deno.env.get("BILLING_ALERT_TO") || "admin@alloygp.co").split(/[,\s]+/).filter(Boolean);
const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co";
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const prettyType = (t: unknown) => {
  const u = String(t || "").toUpperCase();
  return `${u.startsWith("PERSONAL") ? "Personal" : "Business"} ${u.includes("SAVINGS") ? "savings" : "checking"}`;
};

async function notifyBankAdded(db: any, account: any, method: any, authorizerId: string | null)
  : Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { sent: false, error: "RESEND_API_KEY not set" };
    let who = "";
    if (authorizerId) {
      const { data: p } = await db.from("profiles").select("name, title").eq("id", authorizerId).maybeSingle();
      const { data: u } = await db.auth.admin.getUserById(authorizerId);
      who = [p?.name, p?.title ? `(${p.title})` : "", u?.user?.email ? `· ${u.user.email}` : ""].filter(Boolean).join(" ");
    }
    const when = method?.ach_authorized_at ? new Date(method.ach_authorized_at) : new Date();
    const whenStr = when.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";
    const adminUrl = `${PORTAL_URL}/admin/clients?client=${account.id}`;
    const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
    const row = (k: string, v: string) =>
      `<tr><td class="gp-k" style="font-family:${F};font-size:12px;color:#7a6f88;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">${k}</td>` +
      `<td class="gp-v" style="font-family:${F};font-size:13.5px;color:#3f2a55;padding:6px 0;">${v}</td></tr>`;
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .gp-stage { background: #1f0e30 !important; }
      .gp-card { border-color: transparent !important; }
      .gp-dark { background: #2a1540 !important; }
      .gp-dark .gp-h, .gp-dark .gp-v { color: #f3eef9 !important; }
      .gp-dark .gp-k, .gp-dark .gp-muted { color: #b3a6c9 !important; }
      .gp-dark .gp-rule { border-color: #46325c !important; }
      .gp-dark .gp-btn { background: #d9356e !important; }
      .gp-dark .gp-link { color: #e7dcf3 !important; }
    }
  </style></head>
<body class="gp-stage" bgcolor="#381c4f" style="margin:0;padding:28px 12px;background:#381c4f;">
  <div class="gp-card gp-dark" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:26px 28px;">
    <div style="font-family:${F};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d9356e;">Billing · action needed</div>
    <div class="gp-h" style="font-family:${F};font-size:21px;font-weight:700;color:#381c4f;margin:6px 0 14px;">${esc(account.company)} added a bank account</div>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row("Bank", `<strong>${esc(method?.bank_name || "Bank account")}</strong> · ${esc(prettyType(method?.account_type))} · •••• ${esc(method?.last4 || "----")}`)}
      ${row("Status", esc(method?.verification_status === "VERIFIED" ? "verified" : "not verified (normal — QuickBooks drafts anyway)"))}
      ${row("Authorized by", esc(who || "—"))}
      ${row("When", esc(whenStr))}
      ${row("Agreement", esc(`ACH authorization ${method?.ach_agreement_version || "v1"}`))}
      ${row("QuickBooks customer", esc(account.quickbooks_customer_id || "—"))}
    </table>
    <div class="gp-v" style="font-family:${F};font-size:13.5px;line-height:1.6;color:#3f2a55;margin:16px 0 18px;">
      <strong>Nothing drafts yet.</strong> Start their autopay in Admin — pick the service item, the monthly amount and the draft day. The first draft can't be before the 1st of next month, so verify the template in QuickBooks before then.
    </div>
    <a href="${adminUrl}" class="gp-btn" style="display:inline-block;background:#381c4f;color:#ffffff;font-family:${F};font-weight:700;font-size:13.5px;text-decoration:none;padding:12px 20px;border-radius:999px;">Open in Admin → Autopay</a>
    <div class="gp-muted gp-rule" style="font-family:${F};font-size:12px;color:#8a8395;margin-top:22px;border-top:1px solid #ece8f1;padding-top:12px;">Sent by the Alloy portal when a client adds a bank account. Bank numbers are never stored — only this masked reference.</div>
  </div>
</body></html>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: BILLING_ALERT_TO, subject: `Bank account added: ${account.company} — start their autopay`, html }),
    });
    if (!res.ok) { const t = await res.text(); console.error("bank alert resend", res.status, t); return { sent: false, error: `resend ${res.status}: ${t.slice(0, 200)}` }; }
    const j = await res.json().catch(() => ({}));
    return { sent: true, id: j?.id };
  } catch (e) { console.error("bank alert", e); return { sent: false, error: String(e) }; }
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
    if (!me) return json({ error: "forbidden" }, 403);
    const billingOk = me.is_staff || me.role === "owner" || me.role === "accounting";

    const body = await req.json().catch(() => ({}));
    const action = body.action || "get";
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- get: method-on-file summary (any authed user, own account) ---
    if (action === "get") {
      if (!me.account_id) return json({ methods: [] });
      const { data } = await db.from("quickbooks_payment_methods")
        .select("last4, account_name, bank_name, account_type, verification_status, is_default, ach_authorized_at, created_at")
        .eq("account_id", me.account_id).order("created_at", { ascending: false });
      return json({ methods: data || [] });
    }

    // --- config: where the browser tokenizes raw bank details (any authed user).
    // The function owns QBO_ENV, so the UI can never drift to the wrong Intuit
    // host (a sandbox token is useless against a production customer). Intuit's
    // tokens endpoint is unauthenticated by design — raw numbers never reach us.
    if (action === "config") {
      return json({ env: sandbox() ? "sandbox" : "production", tokenUrl: `${payBase()}/quickbooks/v4/payments/tokens` });
    }

    // --- staff actions: Alloy configures billing (clients never set their price) ---
    const staffActions = ["inspectRecurring", "listItems", "createRecurring", "deleteRecurring", "backfillBankMethods", "resendBankAlert"];
    if (staffActions.includes(action)) {
      if (!me.is_staff) return json({ error: "staff only" }, 403);

      if (action === "resendBankAlert") {
        const id = String(body.accountId || "");
        const { data: acct } = await db.from("accounts").select("id, company, quickbooks_customer_id").eq("id", id).maybeSingle();
        if (!acct) return json({ error: "account not found" }, 404);
        const { data: pm } = await db.from("quickbooks_payment_methods").select("*").eq("account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!pm) return json({ error: "no bank on file" }, 400);
        return json({ ok: true, to: BILLING_ALERT_TO, alert: await notifyBankAdded(db, acct, pm, pm.ach_authorized_by || null) });
      }
      const { token, realmId } = await getAccessToken(db);

      if (action === "inspectRecurring") {
        const r = await qboGet(realmId, token, `query?query=${encodeURIComponent("SELECT * FROM RecurringTransaction")}`);
        return json(await r.json());
      }

      if (action === "listItems") {
        const r = await qboGet(realmId, token, `query?query=${encodeURIComponent("SELECT Id, Name, UnitPrice, Type FROM Item WHERE Active = true MAXRESULTS 1000")}`);
        const items = ((await r.json())?.QueryResponse?.Item || [])
          .map((i: any) => ({ id: String(i.Id), name: i.Name, type: i.Type, unitPrice: i.UnitPrice }));
        return json({ items });
      }

      // One-time backfill: pull each linked client's bank-on-file from QBO Payments
      // into quickbooks_payment_methods so the Account page card has data before
      // any client has gone through the onboarding capture flow.
      if (action === "backfillBankMethods") {
        const { data: accts } = await db.from("accounts").select("id, quickbooks_customer_id").not("quickbooks_customer_id", "is", null);
        const summary: any[] = [];
        for (const a of accts || []) {
          try {
            const r = await fetch(`${payBase()}/quickbooks/v4/customers/${a.quickbooks_customer_id}/bank-accounts`,
              { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });
            if (!r.ok) { summary.push({ account: a.id, ok: false, status: r.status }); continue; }
            const list = await r.json();
            const banks = Array.isArray(list) ? list : [];
            const bank = banks.find((b: any) => b.default) || banks[0];
            if (!bank) { summary.push({ account: a.id, ok: true, found: 0 }); continue; }
            await db.from("quickbooks_payment_methods").upsert({
              account_id: a.id,
              qbo_bank_account_id: String(bank.id),
              last4: last4Of(bank.accountNumber),
              account_name: bank.name || null,
              bank_name: bank.bankName || null,
              account_type: bank.accountType || null,
              verification_status: bank.verificationStatus || null,
              is_default: bank.default !== false,
            }, { onConflict: "account_id, qbo_bank_account_id" });
            summary.push({ account: a.id, ok: true, bank: bank.bankName, last4: last4Of(bank.accountNumber) });
          } catch (e) { summary.push({ account: a.id, ok: false, error: String(e) }); }
        }
        return json({ ok: true, summary });
      }

      if (action === "deleteRecurring") {
        const id = String(body.recurringId || "");
        if (!id) return json({ error: "recurringId required" }, 400);
        const g = await qboGet(realmId, token, `recurringtransaction/${id}`);
        if (!g.ok) return json({ error: `read ${g.status}: ${(await g.text()).slice(0, 300)}` }, 502);
        const wrap = (await g.json())?.RecurringTransaction || {};
        const kind = wrap.SalesReceipt ? "SalesReceipt" : wrap.Invoice ? "Invoice" : null;
        if (!kind) return json({ error: "not a recurring txn" }, 404);
        const ent = wrap[kind];
        const del = await qboPost(realmId, token, "recurringtransaction?operation=delete",
          { [kind]: { Id: ent.Id, SyncToken: ent.SyncToken, RecurringInfo: ent.RecurringInfo } });
        const delText = await del.text();
        if (del.ok) await db.from("autopay_schedules").delete().eq("qbo_recurring_txn_id", id);
        return json({ ok: del.ok, status: del.status, body: delText.slice(0, 300) });
      }

      // createRecurring: build an Automated ACH sales-receipt template (draft by default).
      const accountId = String(body.accountId || "");
      if (!accountId) return json({ error: "accountId required" }, 400);
      const { data: account } = await db.from("accounts")
        .select("id, company, quickbooks_customer_id").eq("id", accountId).maybeSingle();
      if (!account) return json({ error: "account not found" }, 404);
      if (!account.quickbooks_customer_id) return json({ error: "account not linked to a QBO customer" }, 400);
      // An ACH template is useless without a bank on file — it would just fail on
      // the first draft. The client adds the bank from their portal (owner /
      // accounting, nudged at sign-in); Admin shows it as soon as it lands.
      const { count: banks } = await db.from("quickbooks_payment_methods")
        .select("id", { count: "exact", head: true }).eq("account_id", account.id);
      if (!banks) return json({ error: "no bank account on file yet — the client adds it from their portal first" }, 400);

      const amount = Number(body.amount);
      const itemId = String(body.itemId || "");
      if (!(amount > 0) || !itemId) return json({ error: "amount (>0) and itemId required" }, 400);
      const day = Math.min(Math.max(Number(body.dayOfMonth) || 1, 1), 28);   // cap at 28 (every month has it)

      // QBO recurring templates are ALWAYS created active (the API ignores
      // Active:false on create and on update). So the verification window is the
      // StartDate: default the first charge to the 1st of next month, and never
      // allow a past/immediate start — Alloy verifies in QBO before that date.
      const fallbackStart = firstOfNextMonth();
      let startDate = String(body.startDate || fallbackStart);
      if (startDate < fallbackStart) startDate = fallbackStart;   // no past/immediate charges

      const sr = {
        RecurringInfo: {
          Name: body.name || `${account.company} Monthly`,
          RecurType: "Automated",
          ScheduleInfo: { IntervalType: "Monthly", NumInterval: 1, DayOfMonth: day, StartDate: startDate },
        },
        CustomerRef: { value: String(account.quickbooks_customer_id) },
        Line: [{
          Description: body.description || null,
          Amount: amount,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: { value: itemId }, UnitPrice: amount, Qty: 1 },
        }],
        PaymentMethodRef: { value: String(body.paymentMethodRef || ACH_PAYMENT_METHOD) },
        DepositToAccountRef: { value: UNDEPOSITED_FUNDS },
      };

      const r = await qboPost(realmId, token, "recurringtransaction", { SalesReceipt: sr });
      if (!r.ok) return json({ error: `recurring create ${r.status}: ${(await r.text()).slice(0, 500)}` }, 502);
      const c = (await r.json());
      const created = c?.RecurringTransaction?.SalesReceipt || c?.SalesReceipt || {};

      // Persist a local copy so the Account page can show "next draft · $X" and
      // "drafted monthly" without a live QBO call. One active schedule per account.
      await db.from("autopay_schedules").upsert({
        account_id: account.id,
        qbo_recurring_txn_id: created?.Id || null,
        qbo_item_id: itemId,
        amount,
        billing_day: day,
        start_date: startDate,
        status: "active",
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id" });

      return json({
        ok: true,
        recurringId: created?.Id || null,
        name: created?.RecurringInfo?.Name || null,
        active: created?.RecurringInfo?.Active ?? true,
        firstChargeDate: startDate,
        total: created?.TotalAmt ?? amount,
        note: `Created & active. First auto-draft on ${startDate} — verify in QBO before then (or delete to cancel).`,
      });
    }

    // --- client billing actions: enter/confirm a bank account (own account) ---
    if (!billingOk) return json({ error: "forbidden: billing role required" }, 403);
    if (!me.account_id) return json({ error: "no account" }, 403);

    const { data: account } = await db.from("accounts")
      .select("id, company, quickbooks_customer_id").eq("id", me.account_id).maybeSingle();
    if (!account) return json({ error: "account not found" }, 404);

    const { token, realmId } = await getAccessToken(db);

    if (action === "createCustomer") {
      const customerId = await ensureCustomer(db, token, realmId, account, body.contact || {});
      return json({ ok: true, quickbooksCustomerId: customerId });
    }

    if (action === "attach") {
      const bankToken = String(body.token || "").trim();   // opaque bank token from the browser
      if (!bankToken) return json({ error: "token required" }, 400);
      if (!body.achAuthorized) return json({ error: "ACH authorization required" }, 400);

      const customerId = await ensureCustomer(db, token, realmId, account, body.contact || {});

      const res = await fetch(`${payBase()}/quickbooks/v4/customers/${customerId}/bank-accounts/createFromToken`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Request-Id": crypto.randomUUID(),    // Payments idempotency key
        },
        // Intuit expects the token under `value` (PMT-4002 "value is required" otherwise).
        body: JSON.stringify({ value: bankToken }),
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
      const alert = await notifyBankAdded(db, { ...account, quickbooks_customer_id: customerId }, row, user.id);
      return json({ ok: true, alert, method: { last4: row.last4, bankName: row.bank_name, accountType: row.account_type, verificationStatus: row.verification_status, authorizedAt: row.ach_authorized_at } });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
