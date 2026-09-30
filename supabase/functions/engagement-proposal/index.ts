import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// engagement-proposal — the CLIENT-side state changes on Alloy's own proposal
// to a new client (table: engagement_proposals; NOT the CMGT board system).
//
// Staff author and send the proposal directly under RLS (Admin). Everything a
// client does to it comes here, with the service role, so the record can't be
// forged from the browser and Alloy hears about it by email:
//   • accept          — the account OWNER accepts → status 'accepted' + who /
//                       when / which version + which agreement wording. Emails
//                       PROPOSAL_ALERT_TO (default admin@alloygp.co).
//   • request_changes — any client user on the account asks a question or asks
//                       for a change → appended to change_requests + emailed.
//   • notify_sent     — STAFF: email the account's owner(s) that the proposal is
//                       waiting for them in the portal.
//
// Authorization: the caller's own profile row (account_id / role / is_staff)
// read with the caller's JWT; the proposal must belong to that account. Staff
// previewing a client ("View as client") get a clear 403 on accept — the
// commitment must come from the client's own sign-in. verify_jwt: true.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const PORTAL_URL = (Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co").replace(/\/$/, "");
const ALERT_TO = (Deno.env.get("PROPOSAL_ALERT_TO") || Deno.env.get("BILLING_ALERT_TO") || "admin@alloygp.co")
  .split(/[,\s]+/).filter(Boolean);
const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 ? 2 : 0 }) : "—";
};
const whenET = (d = new Date()) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";

// One branded shell for every email this function sends.
function shell(opts: { kicker: string; title: string; rows?: [string, string][]; body?: string; ctaUrl?: string; ctaLabel?: string; footer: string }) {
  const row = (k: string, v: string) =>
    `<tr><td style="font-family:${F};font-size:12px;color:#7a6f88;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">${k}</td>` +
    `<td style="font-family:${F};font-size:13.5px;color:#3f2a55;padding:6px 0;">${v}</td></tr>`;
  return `
<div style="background:#f8f7fc;padding:28px 12px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:26px 28px;border:1px solid #ece8f1;">
    <div style="font-family:${F};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d9356e;">${esc(opts.kicker)}</div>
    <div style="font-family:${F};font-size:21px;font-weight:700;color:#381c4f;margin:6px 0 14px;">${esc(opts.title)}</div>
    ${opts.rows && opts.rows.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${opts.rows.map(([k, v]) => row(k, v)).join("")}</table>` : ""}
    ${opts.body ? `<div style="font-family:${F};font-size:13.5px;line-height:1.6;color:#3f2a55;margin:16px 0 18px;">${opts.body}</div>` : ""}
    ${opts.ctaUrl ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:#381c4f;color:#ffffff;font-family:${F};font-weight:700;font-size:13.5px;text-decoration:none;padding:12px 20px;border-radius:999px;">${esc(opts.ctaLabel || "Open")}</a>` : ""}
    <div style="font-family:${F};font-size:12px;color:#8a8395;margin-top:22px;border-top:1px solid #ece8f1;padding-top:12px;">${esc(opts.footer)}</div>
  </div>
</div>`;
}

async function sendEmail(to: string[], subject: string, html: string): Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { sent: false, error: "RESEND_API_KEY not set" };
    if (!to.length) return { sent: false, error: "no recipients" };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) { const t = await res.text(); console.error("resend", res.status, t); return { sent: false, error: `resend ${res.status}: ${t.slice(0, 200)}` }; }
    const j = await res.json().catch(() => ({}));
    return { sent: true, id: j?.id };
  } catch (e) { console.error("email", e); return { sent: false, error: String(e) }; }
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
      .from("profiles").select("account_id, is_staff, role, name, title").eq("id", user.id).maybeSingle();
    if (!me) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const proposalId = String(body.proposalId || "");
    if (!proposalId) return json({ error: "proposalId required" }, 400);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: p, error: pErr } = await db.from("engagement_proposals").select("*").eq("id", proposalId).maybeSingle();
    if (pErr) throw pErr;
    if (!p) return json({ error: "proposal not found" }, 404);
    const { data: account } = await db.from("accounts").select("id, company, short_name").eq("id", p.account_id).maybeSingle();
    const company = account?.company || account?.short_name || "the client";
    const adminUrl = `${PORTAL_URL}/admin/clients?client=${p.account_id}`;

    // ── accept ─────────────────────────────────────────────────────────────
    if (action === "accept") {
      if (me.is_staff) return json({ error: "Staff preview — only the client's owner can accept, from their own sign-in." }, 403);
      if (p.account_id !== me.account_id) return json({ error: "forbidden" }, 403);
      if (me.role !== "owner") return json({ error: "Only your account owner can accept the proposal." }, 403);
      if (p.status === "accepted") return json({ error: "This proposal has already been accepted." }, 409);
      if (p.status !== "sent") return json({ error: "This proposal isn't open for acceptance." }, 409);
      const name = String(body.name || "").trim();
      if (name.length < 2) return json({ error: "Enter your full name." }, 400);
      const title = String(body.title || "").trim().slice(0, 120);
      const agreementVersion = String(body.agreementVersion || "v1").slice(0, 20);
      const now = new Date().toISOString();

      const { data: updated, error: uErr } = await db.from("engagement_proposals").update({
        status: "accepted", accepted_at: now, accepted_by: user.id, accepted_name: name,
        accepted_title: title || null, accepted_version: p.version, agreement_version: agreementVersion,
      }).eq("id", p.id).eq("status", "sent").select("*").single();
      if (uErr) throw uErr;

      const alert = await sendEmail(ALERT_TO, `Proposal accepted: ${company}`, shell({
        kicker: "Proposal · accepted",
        title: `${company} accepted their proposal`,
        rows: [
          ["Accepted by", `<strong>${esc(name)}</strong>${title ? ` (${esc(title)})` : ""} · ${esc(user.email || "")}`],
          ["When", esc(whenET())],
          ["Version", esc(`v${p.version}`) + ` · agreement ${esc(agreementVersion)}`],
          ["Monthly", esc(money(p.monthly_amount)) + (p.setup_amount ? ` · setup ${esc(money(p.setup_amount))}` : "")],
          ["Start", esc(p.start_date || "—") + (p.term_months ? ` · ${esc(p.term_months)} months` : "")],
          ["Locations", esc(p.locations_count)],
        ],
        body: "<strong>Their portal is now open.</strong> Next they are nudged to add a bank account for autopay; once it lands you start the monthly draft in Admin → Autopay.",
        ctaUrl: adminUrl, ctaLabel: "Open in Admin",
        footer: "Sent by the Alloy portal when a client owner accepts an engagement proposal.",
      }));
      return json({ proposal: updated, alert });
    }

    // ── request_changes ────────────────────────────────────────────────────
    if (action === "request_changes") {
      if (me.is_staff) return json({ error: "Staff preview — questions come from the client's own sign-in." }, 403);
      if (p.account_id !== me.account_id) return json({ error: "forbidden" }, 403);
      if (p.status !== "sent" && p.status !== "accepted") return json({ error: "This proposal isn't open." }, 409);
      const message = String(body.message || "").trim();
      if (message.length < 5) return json({ error: "Tell us a little more so we can act on it." }, 400);
      if (message.length > 4000) return json({ error: "Keep it under 4,000 characters." }, 400);
      const entry = { at: new Date().toISOString(), by: user.id, name: me.name || user.email || "", email: user.email || "", message };
      const list = Array.isArray(p.change_requests) ? p.change_requests : [];
      const { error: uErr } = await db.from("engagement_proposals").update({ change_requests: [...list, entry] }).eq("id", p.id);
      if (uErr) throw uErr;

      const alert = await sendEmail(ALERT_TO, `Proposal question from ${company}`, shell({
        kicker: "Proposal · question",
        title: `${entry.name || company} asked about their proposal`,
        rows: [["From", `${esc(entry.name)} · ${esc(entry.email)}`], ["When", esc(whenET())], ["Proposal", esc(`v${p.version} · ${p.status}`)]],
        body: `<div style="white-space:pre-wrap;background:#f8f7fc;border-radius:10px;padding:12px 14px;">${esc(message)}</div>`,
        ctaUrl: adminUrl, ctaLabel: "Open in Admin",
        footer: "Reply by email or edit and re-send the proposal from Admin. Their portal stays locked to the proposal until they accept.",
      }));
      return json({ ok: true, request: entry, alert });
    }

    // ── notify_sent (staff) ────────────────────────────────────────────────
    if (action === "notify_sent") {
      if (!me.is_staff) return json({ error: "staff only" }, 403);
      if (p.status !== "sent") return json({ error: "Send the proposal first." }, 409);
      const to = new Set<string>();
      const { data: owners } = await db.from("profiles").select("id").eq("account_id", p.account_id).eq("role", "owner").eq("is_staff", false);
      for (const o of owners || []) {
        const { data: u } = await db.auth.admin.getUserById(o.id);
        const email = u?.user?.email; if (email) to.add(email.toLowerCase());
      }
      const { data: invites } = await db.from("account_invites").select("email").eq("account_id", p.account_id).eq("role", "owner").eq("is_staff", false);
      for (const i of invites || []) if (i.email) to.add(String(i.email).toLowerCase());
      const list = [...to];
      if (!list.length) return json({ sent: 0, to: [], note: "No owner on this account yet — invite one first (Team & access)." });

      const r = await sendEmail(list, `Your proposal from Alloy Growth Partners is ready`, shell({
        kicker: "Alloy Growth Partners",
        title: `Your growth partnership proposal is ready, ${company}`,
        body: "Sign in to your Growth Portal to read the proposal, see exactly what we'll do in each of your markets, and accept when you're ready. Questions? Ask right from the proposal page — your Alloy team gets them immediately.",
        ctaUrl: PORTAL_URL, ctaLabel: "Open your proposal",
        footer: "You're receiving this because your company has a proposal waiting in the Alloy Growth Portal.",
      }));
      return json({ sent: r.sent ? list.length : 0, to: list, alert: r });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
