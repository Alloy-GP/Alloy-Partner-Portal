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
//   • staff_reply     — STAFF: answer in the thread → appended with role 'staff'
//                       and emailed to whoever asked (else the owners).
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

import { ALERT_TO, esc, money, whenET, sendEmail, safePortalUrl } from "./mail.ts";
// Shared with the portal (src/lib/proposalPlans.js re-exports the same file):
// one implementation of plans + the agreement document, so what the owner
// confirmed on screen is byte-for-byte what we snapshot and hash here.
import { normalizePlans, pickPlan, marketsFor, agreementDocument, fmtUSD } from "./proposalShared.js";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const clientIp = (req: Request) => (req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0] || req.headers.get("x-real-ip") || "").trim() || null;

// Every client-side email address on an account: signed-in owners + invited
// owners who have not signed in yet. Lower-cased, de-duplicated.
async function ownerEmails(db: any, accountId: string): Promise<string[]> {
  const to = new Set<string>();
  const { data: owners } = await db.from("profiles").select("id").eq("account_id", accountId).eq("role", "owner").eq("is_staff", false);
  for (const o of owners || []) {
    const { data: u } = await db.auth.admin.getUserById(o.id);
    const email = u?.user?.email; if (email) to.add(email.toLowerCase());
  }
  const { data: invites } = await db.from("account_invites").select("email").eq("account_id", accountId).eq("role", "owner").eq("is_staff", false);
  for (const i of invites || []) if (i.email) to.add(String(i.email).toLowerCase());
  return [...to];
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
    const { data: account } = await db.from("accounts").select("id, company, short_name, locations").eq("id", p.account_id).maybeSingle();
    const company = account?.company || account?.short_name || "the client";
    // Links in every email point at the portal the caller is on (staging or
    // production) — safelisted in safePortalUrl.
    const portalUrl = safePortalUrl(body.portalUrl);
    const adminUrl = `${portalUrl}/admin/clients?client=${p.account_id}`;

    // ── accept ─────────────────────────────────────────────────────────────
    if (action === "accept") {
      if (me.is_staff) return json({ error: "Staff preview — only the client's owner can accept, from their own sign-in." }, 403);
      if (p.account_id !== me.account_id) return json({ error: "forbidden" }, 403);
      if (me.role !== "owner") return json({ error: "Only your account owner can accept the proposal." }, 403);
      if (p.status === "accepted") return json({ error: "This proposal has already been accepted." }, 409);
      if (p.status !== "sent") return json({ error: "This proposal isn't open for acceptance." }, 409);
      if (p.valid_through && String(p.valid_through).slice(0, 10) < todayISO()) return json({ error: "This proposal has expired. Ask your Alloy team to refresh it." }, 409);
      const name = String(body.name || "").trim();
      if (name.length < 2) return json({ error: "Enter your full name." }, 400);
      const title = String(body.title || "").trim().slice(0, 120);
      const agreementVersion = String(body.agreementVersion || "v1").slice(0, 20);
      if (!body.agreementRead) return json({ error: "Read and confirm the agreement first." }, 400);
      const now = new Date().toISOString();

      // The plan they chose (falls back to the recommended one for legacy rows).
      const plans = normalizePlans(p.plans && p.plans.length ? p.plans : [{
        key: "plan", name: "Growth plan", monthly: p.monthly_amount, setup: p.setup_amount, locations: p.locations_count, termMonths: p.term_months || 12, recommended: true,
      }]);
      const plan = pickPlan(plans, String(body.planKey || ""));
      if (!plan) return json({ error: "This proposal has no plan to accept." }, 409);

      // The exact agreement they confirmed — snapshotted and hashed server-side
      // from the same inputs the page rendered, so it can't be edited in flight.
      const { named } = marketsFor(Array.isArray(p.markets) && p.markets.length ? p.markets : account?.locations, plan);
      const doc = agreementDocument({
        ref: p.ref, clientLegalName: p.client_legal_name, clientEntityType: p.client_entity_type, clientAddress: p.client_address,
        effectiveDate: p.start_date, plan, markets: named, signerName: name, signerTitle: title, spoc: p.spoc, exclusivityMiles: p.exclusivity_miles,
      });
      const hash = await sha256Hex(doc.text);
      const snapshot = { ...doc, acceptedAt: now, agreementVersion, ip: clientIp(req), userAgent: (req.headers.get("user-agent") || "").slice(0, 400) };

      const { data: updated, error: uErr } = await db.from("engagement_proposals").update({
        status: "accepted", accepted_at: now, accepted_by: user.id, accepted_name: name,
        accepted_title: title || null, accepted_version: p.version, agreement_version: agreementVersion,
        accepted_plan_key: plan.key, accepted_ip: snapshot.ip, accepted_user_agent: snapshot.userAgent,
        agreement_snapshot: snapshot, agreement_hash: hash,
        // the summary columns follow the accepted plan
        monthly_amount: plan.monthly, setup_amount: plan.setup || null, term_months: plan.termMonths, locations_count: plan.locations,
      }).eq("id", p.id).eq("status", "sent").select("*").single();
      if (uErr) throw uErr;

      const alert = await sendEmail(ALERT_TO, `Proposal accepted: ${company}`, {
        kicker: "Proposal · accepted",
        title: `${company} accepted their proposal`,
        rows: [
          ["Accepted by", `<strong>${esc(name)}</strong>${title ? ` (${esc(title)})` : ""} · ${esc(user.email || "")}`],
          ["When", esc(whenET())],
          ["Plan", `<strong>${esc(plan.name)}</strong> · ${esc(plan.locations)} location${plan.locations === 1 ? "" : "s"}`],
          ["Version", esc(`v${p.version}`) + ` · agreement ${esc(agreementVersion)} · ${esc(hash.slice(0, 12))}…`],
          ["Monthly", esc(fmtUSD(plan.monthly)) + (plan.setup ? ` · setup ${esc(fmtUSD(plan.setup))}` : "")],
          ["Start", esc(p.start_date || "—") + ` · ${esc(plan.termMonths)} months`],
          ["Signed from", esc(snapshot.ip || "unknown IP")],
        ],
        body: "<strong>Their portal is now open.</strong> Next they are nudged to add a bank account for autopay; once it lands you start the monthly draft in Admin → Autopay.",
        ctaUrl: adminUrl, ctaLabel: "Open in Admin",
        footer: "Sent by the Alloy portal when a client owner accepts an engagement proposal.",
      }, user.email || undefined);
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
      const entry = { at: new Date().toISOString(), by: user.id, name: me.name || user.email || "", email: user.email || "", role: "client", message };
      const list = Array.isArray(p.change_requests) ? p.change_requests : [];
      const { error: uErr } = await db.from("engagement_proposals").update({ change_requests: [...list, entry] }).eq("id", p.id);
      if (uErr) throw uErr;

      const alert = await sendEmail(ALERT_TO, `Proposal question from ${company}`, {
        kicker: "Proposal · question",
        title: `${entry.name || company} asked about their proposal`,
        rows: [["From", `${esc(entry.name)} · ${esc(entry.email)}`], ["When", esc(whenET())], ["Proposal", esc(`v${p.version} · ${p.status}`)]],
        body: `<div style="white-space:pre-wrap;background:#f8f7fc;border-radius:10px;padding:12px 14px;">${esc(message)}</div>`,
        ctaUrl: adminUrl, ctaLabel: "Open in Admin",
        footer: "Reply to this email to answer them directly, or edit and re-send the proposal from Admin. Their portal stays locked to the proposal until they accept.",
      }, entry.email || undefined);
      return json({ ok: true, request: entry, alert });
    }

    // ── staff_reply (staff) ────────────────────────────────────────────────
    if (action === "staff_reply") {
      if (!me.is_staff) return json({ error: "staff only" }, 403);
      if (p.status !== "sent" && p.status !== "accepted") return json({ error: "The client can't see this proposal yet — send it first." }, 409);
      const message = String(body.message || "").trim();
      if (message.length < 2) return json({ error: "Type a reply first." }, 400);
      if (message.length > 4000) return json({ error: "Keep it under 4,000 characters." }, 400);
      const entry = { at: new Date().toISOString(), by: user.id, name: me.name || user.email || "Alloy", email: user.email || "", role: "staff", message };
      const list0 = Array.isArray(p.change_requests) ? p.change_requests : [];
      const { error: uErr } = await db.from("engagement_proposals").update({ change_requests: [...list0, entry] }).eq("id", p.id);
      if (uErr) throw uErr;
      // Email whoever has asked in this thread; if nobody has, the owners.
      const asked: string[] = [...new Set<string>(list0.filter((e: any) => e && e.role !== "staff" && e.email).map((e: any) => String(e.email).toLowerCase()))];
      const to = asked.length ? asked : await ownerEmails(db, p.account_id);
      const alert = await sendEmail(to, `Reply from Alloy on your proposal · ${company}`, {
        kicker: "Alloy Growth Partners",
        title: `${me.name || "Your Alloy team"} replied on your proposal`,
        body: `<div style="white-space:pre-wrap;background:#f8f7fc;border-radius:10px;padding:12px 14px;">${esc(message)}</div><br>Just answer this email to continue the conversation.`,
        ctaUrl: portalUrl, ctaLabel: "Open the proposal",
        footer: `Sent because you asked a question on ${company}'s proposal in the Alloy Growth Portal.`,
      }, user.email || undefined);
      return json({ ok: true, entry, to, alert });
    }

    // ── notify_sent (staff) ────────────────────────────────────────────────
    if (action === "notify_sent") {
      if (!me.is_staff) return json({ error: "staff only" }, 403);
      if (p.status !== "sent") return json({ error: "Send the proposal first." }, 409);
      const list = await ownerEmails(db, p.account_id);
      if (!list.length) return json({ sent: 0, to: [], note: "No owner on this account yet — invite one first (Team & access)." });

      const plansList = normalizePlans(p.plans);
      const planLine = plansList.length
        ? plansList.map((pl: any) => `${esc(pl.name)} ${esc(fmtUSD(pl.monthly))}/mo${pl.recommended && plansList.length > 1 ? " (recommended)" : ""}`).join(" · ")
        : esc(`${p.locations_count} location${Number(p.locations_count) === 1 ? "" : "s"}`);
      const r = await sendEmail(list, `Growth partnership proposal for ${company}`, {
        kicker: "Alloy Growth Partners",
        title: `${company}: your growth partnership proposal`,
        rows: [
          ["Proposal", esc(p.title || "Growth partnership") + (p.ref ? ` · ${esc(p.ref)}` : "")],
          [plansList.length > 1 ? "Plans" : "Plan", planLine],
          ["Valid through", esc(p.valid_through ? new Date(`${String(p.valid_through).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }) : "—")],
        ],
        body: `Sign in at <a href="${portalUrl}" style="color:#381c4f;">${esc(portalUrl.replace(/^https?:\/\//, ""))}</a> with this email address to read the full proposal: what we do in each of your markets, what it costs, and what happens after you accept. If something needs to change, ask from the proposal page and we get it immediately.<br><br>Questions in the meantime? Just reply to this email.`,
        ctaUrl: portalUrl, ctaLabel: "Review the proposal",
        footer: `Sent to the account owner(s) of ${company} by Alloy Growth Partners because a proposal is waiting for you in the Growth Portal.`,
      });
      return json({ sent: r.sent ? list.length : 0, to: list, alert: r });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
