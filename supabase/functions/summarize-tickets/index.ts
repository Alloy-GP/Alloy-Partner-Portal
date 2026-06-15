import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Summarize Zendesk ticket threads into a one-line "what they need" for the
// Projects "Waiting on you" cards. Account-scoped (clients only their own org,
// staff any). Caches in ticket_summaries; only re-calls Claude when the ticket's
// updated_at has advanced past the cached source_updated_at (so it refreshes
// when the ticket updates, and is a cheap cache hit otherwise).
// Secrets: ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN (shared with `zendesk`), ANTHROPIC_API_KEY.

const SUB = (Deno.env.get("ZENDESK_SUBDOMAIN") || "alloycreatives").trim();
const ZBASE = `https://${SUB}.zendesk.com/api/v2`;
function zauth(): string {
  return "Basic " + btoa(`${Deno.env.get("ZENDESK_EMAIL")}/token:${Deno.env.get("ZENDESK_API_TOKEN")}`);
}
async function zd(path: string) {
  const r = await fetch(`${ZBASE}${path}`, { headers: { Authorization: zauth() } });
  if (!r.ok) throw new Error(`zendesk ${r.status}`);
  return r.json();
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

// One-line summary via Claude Haiku. Returns null if no key / on error so the
// card just shows no summary (never blocks).
async function summarize(text: string, name: string): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 60,
        system:
          `You summarize a support ticket into ONE short, plain sentence (max ~14 words) stating what ${name} needs or is waiting on. Refer to the customer as "${name}" — never as "the client" or "the customer". Action-oriented, no preamble, no quotes, no trailing period needed.`,
        messages: [{ role: "user", content: text.slice(0, 6000) }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const out = (j?.content?.[0]?.text || "").trim();
    return out || null;
  } catch {
    return null;
  }
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
      .from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!me?.account_id && !me?.is_staff) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    // Cross-tenant: clients only their own account; staff may target any.
    const accountId = me.is_staff && body.accountId ? String(body.accountId) : me.account_id;
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 20) : [];
    if (!ids.length) return json({ summaries: {}, counts: {} });

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Org scope — only summarize tickets that belong to this account's org.
    const { data: acct } = await admin.from("accounts").select("zendesk_org_id, company, short_name").eq("id", accountId).maybeSingle();
    const orgId = acct?.zendesk_org_id ? String(acct.zendesk_org_id) : null;
    if (!orgId) return json({ summaries: {}, counts: {} });
    const clientName = (acct?.short_name || acct?.company || "the customer").trim();

    const { data: cachedRows } = await admin
      .from("ticket_summaries").select("zendesk_id, summary, source_updated_at, comment_count")
      .eq("account_id", accountId).in("zendesk_id", ids);
    const cache: Record<string, { summary: string; source_updated_at: string | null; comment_count: number | null }> = {};
    for (const c of cachedRows || []) cache[c.zendesk_id] = { summary: c.summary, source_updated_at: c.source_updated_at, comment_count: c.comment_count };

    const out: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const openers: Record<string, boolean> = {};
    const publicCount = (cm: any) => (cm?.comments || []).filter((x: any) => x.public).length;
    for (const id of ids) {
      try {
        const t = await zd(`/tickets/${id}.json?include=users`);
        const tk = t.ticket;
        if (!tk || String(tk.organization_id) !== orgId) continue; // scope guard
        // Who created it (submitter) vs who it's for (requester). An Alloy-domain
        // submitter means we opened it proactively, even though the client is requester.
        const tUsers: Record<string, any> = {};
        for (const u of t.users || []) tUsers[String(u.id)] = u;
        const subEmail = String(tUsers[String(tk.submitter_id)]?.email || "").toLowerCase();
        openers[id] = subEmail.endsWith("@alloygp.co");
        const upd = tk.updated_at;
        const c = cache[id];
        if (c && c.source_updated_at && new Date(c.source_updated_at).getTime() >= new Date(upd).getTime()) {
          out[id] = c.summary; // fresh cache — no model call
          if (c.comment_count != null) counts[id] = c.comment_count;
          else {
            // Backfill the count for a row cached before this column existed —
            // one comments fetch, no model call, then it's cached.
            try {
              const n = publicCount(await zd(`/tickets/${id}/comments.json`));
              counts[id] = n;
              await admin.from("ticket_summaries").update({ comment_count: n }).eq("account_id", accountId).eq("zendesk_id", id);
            } catch { /* count optional */ }
          }
          continue;
        }
        const cm = await zd(`/tickets/${id}/comments.json`);
        const n = publicCount(cm);
        counts[id] = n;
        const convo = (cm.comments || []).filter((x: any) => x.public).map((x: any) => x.body).join("\n---\n");
        const sum = await summarize(`Subject: ${tk.subject}\n\n${convo}`, clientName);
        if (sum) {
          await admin.from("ticket_summaries").upsert(
            { account_id: accountId, zendesk_id: id, summary: sum, source_updated_at: upd, comment_count: n, generated_at: new Date().toISOString() },
            { onConflict: "account_id,zendesk_id" },
          );
          out[id] = sum;
        } else if (c) {
          out[id] = c.summary; // model unavailable — keep last good
        }
      } catch {
        if (cache[id]) { out[id] = cache[id].summary; if (cache[id].comment_count != null) counts[id] = cache[id].comment_count; }
      }
    }
    return json({ summaries: out, counts, openers });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
