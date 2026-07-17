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

// Heuristically strip email signatures / disclaimers / quoted history that
// Zendesk leaves in email-sourced comments. Conservative: only cuts on strong
// signals so it won't eat real message text. Falls back to the raw body.
function cleanMessage(raw: string): string {
  let text = (raw || "").replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // markdown images
  const lines = text.split(/\r?\n/);
  const cut = [
    /^--\s*$/,                                  // standard signature delimiter
    /^(best|kind|warm)\s+regards\b/i,
    /^regards[,!]?\s*$/i,
    /^(many\s+)?thanks[,!]?\s*$/i,
    /^thank you[,!]?\s*$/i,
    /^(sincerely|cheers|best|respectfully)[,!]?\s*$/i,
    /^sent from my /i,
    /^on .+wrote:\s*$/i,                        // quoted reply
    /^from:\s/i,                                // forwarded headers
    /confidentiality notice/i,
    /this e-?mail .*confidential/i,
  ];
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (cut.some((re) => re.test(lines[i].trim()))) { end = i; break; }
  }
  const cleaned = lines.slice(0, end).join("\n").trim();
  return cleaned || (raw || "").trim();
}

function mapTicket(t: any) {
  return {
    id: String(t.id),
    title: t.subject || "(no subject)",
    status: t.status,            // new|open|pending|hold|solved|closed
    priority: t.priority || null, // low|normal|high|urgent
    updated_at: t.updated_at,
    created_at: t.created_at,
    requester_id: t.requester_id ? String(t.requester_id) : null,
  };
}

// Public attachments on a comment → light shape for the UI.
function mapAttachments(att: any[]): any[] {
  return (att || []).map((a) => ({
    id: String(a.id),
    name: a.file_name,
    url: a.content_url,
    contentType: a.content_type || "",
    size: a.size || 0,
    thumb: (a.thumbnails && a.thumbnails[0] && a.thumbnails[0].content_url) || null,
  }));
}

function ccList(ids: any[], users: Record<string, any>): any[] {
  return (ids || [])
    .map((id) => users[String(id)])
    .filter(Boolean)
    .map((u: any) => ({ name: u.name || u.email, email: u.email || null }));
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
      .from("profiles").select("account_id, is_staff, name").eq("id", user.id).maybeSingle();
    if (!profile?.account_id) return json({ error: "no account" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Resolve which account's tickets to act on. A client can ONLY ever touch
    // their own account; staff may view any client. This is the cross-tenant
    // boundary — never trust the requested id for non-staff.
    const requested = body.accountId ? String(body.accountId) : null;
    let targetAccountId = profile.account_id;
    if (requested && requested !== String(profile.account_id)) {
      if (!profile.is_staff) return json({ error: "forbidden" }, 403);
      targetAccountId = requested;
    }

    const { data: account } = await userClient
      .from("accounts").select("zendesk_org_id").eq("id", targetAccountId).maybeSingle();
    // No row (or RLS hid it) → treat as not authorized / not configured.
    const orgId = account?.zendesk_org_id || null;

    // --- staff-only: find an org id by name (one-time setup helper) ---
    if (action === "find_org") {
      if (!profile.is_staff) return json({ error: "forbidden" }, 403);
      const r = await zd(`/organizations/autocomplete.json?name=${encodeURIComponent(body.query || "")}`);
      return json({ organizations: (r.organizations || []).map((o: any) => ({ id: String(o.id), name: o.name })) });
    }

    // --- upload a file to Zendesk, returns a token to attach on a reply ---
    // (No org needed — the reply itself is org-checked; any signed-in user with
    // an account may stage an upload.)
    if (action === "upload") {
      const filename = String(body.filename || "file");
      const contentType = String(body.contentType || "application/octet-stream");
      const bytes = Uint8Array.from(atob(String(body.data || "")), (c) => c.charCodeAt(0));
      const res = await fetch(`${BASE}/uploads.json?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Authorization": authHeader(), "Content-Type": contentType },
        body: bytes,
      });
      if (!res.ok) return json({ error: `upload failed ${res.status}: ${await res.text()}` }, 500);
      const j = await res.json();
      return json({ token: j.upload?.token || null });
    }

    if (!orgId) return json({ tickets: [], messages: [], notConfigured: true });

    // --- list the account's tickets (by org id; newest first) ---
    if (action === "list") {
      const r = await zd(`/organizations/${orgId}/tickets.json?include=users&page[size]=100`);
      const users: Record<string, any> = {};
      for (const u of r.users || []) users[String(u.id)] = u;
      const tickets = (r.tickets || [])
        .map((t: any) => {
          const base = mapTicket(t);
          const ru = users[String(t.requester_id)] || {};
          return { ...base, requester: ru.name || null, requesterEmail: ru.email || null };
        })
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return json({ tickets });
    }

    // --- read one ticket's public thread (+ requester, CCs, attachments) ---
    if (action === "thread") {
      const id = String(body.id);
      const t = await zd(`/tickets/${id}.json?include=users`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);
      const tUsers: Record<string, any> = {};
      for (const u of t.users || []) tUsers[String(u.id)] = u;
      const requester = tUsers[String(t.ticket.requester_id)] || {};
      const ccs = ccList(t.ticket.email_cc_ids || t.ticket.collaborator_ids || [], tUsers);

      const c = await zd(`/tickets/${id}/comments.json?include=users`);
      const users: Record<string, any> = {};
      for (const u of c.users || []) users[String(u.id)] = u;
      const messages = (c.comments || [])
        .filter((m: any) => m.public)
        .map((m: any) => {
          const a = users[String(m.author_id)] || {};
          return {
            id: String(m.id),
            body: cleanMessage(m.body),
            created_at: m.created_at,
            author: a.name || "Alloy",
            // role=end-user => the client ("you"); else the Alloy team
            mine: a.role === "end-user",
            attachments: mapAttachments(m.attachments),
          };
        });
      return json({
        ticket: { ...mapTicket(t.ticket), requester: requester.name || null, requesterEmail: requester.email || null },
        messages,
        ccs,
      });
    }

    // --- post a public reply, authored as the caller if they're a Zendesk user ---
    if (action === "reply") {
      const id = String(body.id);
      const text = (body.body || "").trim();
      const uploads = Array.isArray(body.uploads) ? body.uploads.filter(Boolean) : [];
      if (!text && !uploads.length) return json({ error: "empty" }, 400);
      const t = await zd(`/tickets/${id}.json`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);

      // Author the reply as the CALLER. For a CLIENT this must resolve to their
      // OWN Zendesk end-user, never the fallback API agent — otherwise Zendesk
      // treats it as an Alloy reply and emails the client about their own update.
      // Search first (so we never rename an existing user); if a client isn't in
      // Zendesk yet, create them (pre-verified, so no verification email). Staff
      // that don't resolve fall back to the API agent — still an agent reply.
      let authorId: number | undefined;
      try {
        const u = await zd(`/users/search.json?query=${encodeURIComponent(user.email || "")}`);
        if (u.users?.[0]?.id) authorId = u.users[0].id;
      } catch { /* ignore */ }
      if (!authorId && !profile.is_staff && user.email) {
        try {
          const cu = await zd(`/users/create_or_update.json`, {
            method: "POST",
            body: JSON.stringify({ user: { email: user.email, name: profile.name || user.email.split("@")[0], verified: true } }),
          });
          if (cu.user?.id) authorId = cu.user.id;
        } catch { /* fall back to API agent */ }
      }

      const comment: any = { body: text || " ", public: true };
      if (authorId) comment.author_id = authorId;
      if (uploads.length) comment.uploads = uploads;
      const ticket: any = { comment };
      // Optional explicit status (staff-controlled): open | pending | solved.
      if (["open", "pending", "solved"].includes(body.status)) ticket.status = body.status;
      // Optional CCs to add with this reply.
      if (Array.isArray(body.cc) && body.cc.length) {
        ticket.email_ccs = body.cc.map((e: string) => ({ user_email: String(e), action: "put" }));
      }
      await zd(`/tickets/${id}.json`, { method: "PUT", body: JSON.stringify({ ticket }) });
      return json({ ok: true });
    }

    // --- add CC(s) to a ticket without replying ---
    if (action === "add_cc") {
      const id = String(body.id);
      const emails = (Array.isArray(body.cc) ? body.cc : [body.cc]).map((e: any) => String(e || "").trim()).filter(Boolean);
      if (!emails.length) return json({ error: "no emails" }, 400);
      const t = await zd(`/tickets/${id}.json`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);
      await zd(`/tickets/${id}.json`, {
        method: "PUT",
        body: JSON.stringify({ ticket: { email_ccs: emails.map((e: string) => ({ user_email: e, action: "put" })) } }),
      });
      return json({ ok: true });
    }

    // --- client marks the ticket resolved (Zendesk "solved") ---
    if (action === "resolve") {
      const id = String(body.id);
      const t = await zd(`/tickets/${id}.json`);
      if (String(t.ticket.organization_id) !== String(orgId)) return json({ error: "forbidden" }, 403);
      await zd(`/tickets/${id}.json`, { method: "PUT", body: JSON.stringify({ ticket: { status: "solved" } }) });
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
