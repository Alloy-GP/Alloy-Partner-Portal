import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Zendesk proxy. The portal calls this (with the signed-in user's JWT) to
// list / read / reply to the *account's* tickets. Scoped to the account's
// Zendesk organization; only PUBLIC comments are ever returned or posted —
// internal agent notes never reach a client.
//
// Secrets: ZENDESK_SUBDOMAIN (e.g. "alloycreatives"), ZENDESK_EMAIL, ZENDESK_API_TOKEN.

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

// Called from the browser (supabase.functions.invoke) → needs CORS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

function mapTicket(t: any) {
  return {
    id: String(t.id),
    title: t.subject || "(no subject)",
    status: t.status,            // new|open|pending|hold|solved|closed
    priority: t.priority || null, // low|normal|high|urgent
    updated_at: t.updated_at,
    created_at: t.created_at,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    // Identify the caller and resolve their account (RLS-scoped).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await userClient
      .from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!profile?.account_id) return json({ error: "no account" }, 403);

    const { data: account } = await userClient
      .from("accounts").select("zendesk_org_id").eq("id", profile.account_id).maybeSingle();
    const orgId = account?.zendesk_org_id || null;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // --- staff-only: find an org id by name (one-time setup helper) ---
    if (action === "find_org") {
      if (!profile.is_staff) return json({ error: "forbidden" }, 403);
      const r = await zd(`/organizations/autocomplete.json?name=${encodeURIComponent(body.query || "")}`);
      return json({ organizations: (r.organizations || []).map((o: any) => ({ id: String(o.id), name: o.name })) });
    }

    if (!orgId) return json({ tickets: [], messages: [], notConfigured: true });

    // --- list the account's tickets (by org id; newest first) ---
    if (action === "list") {
      const r = await zd(`/organizations/${orgId}/tickets.json?page[size]=100`);
      const tickets = (r.tickets || [])
        .map(mapTicket)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return json({ tickets });
    }

    // --- read one ticket's public thread ---
    if (action === "thread") {
      const id = String(body.id);
      const t = await zd(`/tickets/${id}.json`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);
      const c = await zd(`/tickets/${id}/comments.json?include=users`);
      const users: Record<string, any> = {};
      for (const u of c.users || []) users[String(u.id)] = u;
      const messages = (c.comments || [])
        .filter((m: any) => m.public)
        .map((m: any) => {
          const a = users[String(m.author_id)] || {};
          return {
            id: String(m.id),
            body: m.body,
            created_at: m.created_at,
            author: a.name || "Alloy",
            // role=end-user => the client ("you"); else the Alloy team
            mine: a.role === "end-user",
          };
        });
      return json({ ticket: mapTicket(t.ticket), messages });
    }

    // --- post a public reply, authored as the caller if they're a Zendesk user ---
    if (action === "reply") {
      const id = String(body.id);
      const text = (body.body || "").trim();
      if (!text) return json({ error: "empty" }, 400);
      const t = await zd(`/tickets/${id}.json`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);

      let authorId: number | undefined;
      try {
        const u = await zd(`/users/search.json?query=${encodeURIComponent(user.email || "")}`);
        if (u.users?.[0]?.id) authorId = u.users[0].id;
      } catch { /* fall back to API agent */ }

      const comment: any = { body: text, public: true };
      if (authorId) comment.author_id = authorId;
      await zd(`/tickets/${id}.json`, { method: "PUT", body: JSON.stringify({ ticket: { comment } }) });
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
