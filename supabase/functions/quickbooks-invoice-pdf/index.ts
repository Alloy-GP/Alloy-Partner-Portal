import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Streams a single QuickBooks Online invoice PDF to an authed portal user.
// Account-scoped: the caller may only download invoices belonging to their own
// account (staff may download any). The client passes our internal invoice id
// (uuid); we resolve the QBO invoice id server-side so no arbitrary QBO id can
// be requested. verify_jwt: true.

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "70";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", ...CORS } });

function apiBase(): string {
  return (Deno.env.get("QBO_ENV") || "").trim().toLowerCase() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

// Valid access token from the stored (rotating) connection — refreshes only
// when the cached token is stale. Mirrors sync-quickbooks.getAccessToken.
async function getAccessToken(db: any): Promise<{ token: string; realmId: string }> {
  const clientId = (Deno.env.get("QBO_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("QBO_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID/SECRET not set");

  const { data: row } = await db.from("quickbooks_oauth").select("*").limit(1).maybeSingle();
  if (!row) throw new Error("QBO not connected (run sync-quickbooks once to bootstrap)");

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

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return err("unauthorized", 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return err("unauthorized", 401);

    // Which invoice? Accept our internal invoice id (uuid) from query or body.
    const reqUrl = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* empty */ } }
    const invoiceId = String(body.invoiceId || reqUrl.searchParams.get("invoiceId") || "").trim();
    if (!invoiceId) return err("invoiceId required");

    const { data: me } = await userClient
      .from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!me) return err("forbidden", 403);

    // Service role to resolve the invoice + read tokens.
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inv } = await db
      .from("invoices").select("qbo_invoice_id, account_id, doc_number").eq("id", invoiceId).maybeSingle();
    if (!inv) return err("not found", 404);
    // Account scope: own account only (staff may download any).
    if (!me.is_staff && inv.account_id !== me.account_id) return err("forbidden", 403);

    const { token, realmId } = await getAccessToken(db);
    const pdfUrl = `${apiBase()}/v3/company/${realmId}/invoice/${inv.qbo_invoice_id}/pdf?minorversion=${MINOR_VERSION}`;
    const res = await fetch(pdfUrl, { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/pdf" } });
    if (!res.ok) return err(`QBO pdf ${res.status}: ${await res.text()}`, 502);

    const filename = `invoice-${inv.doc_number || inv.qbo_invoice_id}.pdf`;
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...CORS,
      },
    });
  } catch (e) {
    return err(String(e), 500);
  }
});
