import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Create a NEW Zendesk request (ticket) for the signed-in user's account org.
// Split out from `zendesk` to avoid redeploying that larger (regex-heavy)
// function. SAME cross-tenant rule: a client can only create on their OWN
// account; staff may target any. Secrets: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL,
// ZENDESK_API_TOKEN.

const SUB = Deno.env.get("ZENDESK_SUBDOMAIN") || "alloycreatives";
const BASE = `https://${SUB}.zendesk.com/api/v2`;
function authHeader(): string {
  const email = Deno.env.get("ZENDESK_EMAIL") || "";
  const token = Deno.env.get("ZENDESK_API_TOKEN") || "";
  return "Basic " + btoa(`${email}/token:${token}`);
}
async function zd(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Authorization": authHeader(), "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`Zendesk ${res.status}: ${await res.text()}`);
  return res.json();
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await userClient
      .from("profiles").select("account_id, is_staff, name").eq("id", user.id).maybeSingle();
    if (!profile?.account_id) return json({ error: "no account" }, 403);

    const body = await req.json().catch(() => ({}));

    // Cross-tenant boundary: clients only their own account; staff may target any.
    const requested = body.accountId ? String(body.accountId) : null;
    let targetAccountId = profile.account_id;
    if (requested && requested !== String(profile.account_id)) {
      if (!profile.is_staff) return json({ error: "forbidden" }, 403);
      targetAccountId = requested;
    }
    const { data: account } = await userClient
      .from("accounts").select("zendesk_org_id").eq("id", targetAccountId).maybeSingle();
    const orgId = account?.zendesk_org_id || null;
    if (!orgId) return json({ error: "not configured" }, 400);

    const subject = String(body.subject || "").trim();
    const text = String(body.body || "").trim();
    if (!subject || !text) return json({ error: "subject and message required" }, 400);
    const priority = ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : undefined;
    const uploads = Array.isArray(body.uploads) ? body.uploads.filter(Boolean) : [];

    // Ensure the requester EXISTS and is a MEMBER of the account's org, so the
    // ticket actually lands in that org. Zendesk ties a ticket's organization to
    // the requester's org membership — passing organization_id alone is dropped
    // (and even a follow-up PUT is rejected) if the requester isn't a member.
    // create_or_update is idempotent and also adds the org membership.
    const reqName = profile.name || (user.email || "there").split("@")[0];
    let requesterId: number | undefined;
    try {
      const up = await zd(`/users/create_or_update.json`, {
        method: "POST",
        body: JSON.stringify({ user: { email: user.email, name: reqName, organization_id: Number(orgId) } }),
      });
      if (up.user && up.user.id) requesterId = up.user.id;
    } catch { /* fall back to inline requester below */ }

    const comment: Record<string, unknown> = { body: text, public: true };
    if (uploads.length) comment.uploads = uploads;
    const ticket: Record<string, unknown> = { subject, organization_id: Number(orgId), comment };
    if (priority) ticket.priority = priority;
    if (requesterId) ticket.requester_id = requesterId;
    else ticket.requester = { name: reqName, email: user.email };

    const r = await zd(`/tickets.json`, { method: "POST", body: JSON.stringify({ ticket }) });
    return json({ ok: true, id: r.ticket && r.ticket.id ? String(r.ticket.id) : null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
