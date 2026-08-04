import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Admin console backend. Staff-only (profiles.is_staff). Authorizes via the
// caller's JWT, then performs writes with the service role so it can manage
// every account / invite (client RLS stays strict).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const ACCOUNT_FIELDS = [
  "company", "short_name", "tier", "market", "since",
  "goal_label", "goal_current", "goal_target",
  "monday_board_id", "zendesk_org_id", "whatconverts_profile_id", "quickbooks_customer_id", "locations", "logo_url", "pastel_url",
];
function pick(obj: any, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

// --- Monday real-time onboarding -------------------------------------------
// When a client's board id is set, register the realtime webhooks (idempotent)
// and kick an immediate sync so their data shows right away. Best-effort: a
// Monday hiccup must never block saving the account.
const MONDAY_API = "https://api.monday.com/v2";
const WEBHOOK_EVENTS = ["change_column_value", "create_item", "item_deleted", "change_subitem_column_value", "create_subitem"];

async function mondayApi(query: string, variables: Record<string, unknown>) {
  const token = (Deno.env.get("MONDAY_API_TOKEN") || "").trim();
  if (!token) throw new Error("MONDAY_API_TOKEN not set");
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": token, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error("Monday API error: " + JSON.stringify(j.errors));
  return j.data;
}

async function ensureMondayWebhooks(boardId: string) {
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-monday`;
  const data = await mondayApi(`query ($b: ID!) { webhooks(board_id: $b) { id event } }`, { b: boardId });
  const existing = new Set((data?.webhooks || []).map((w: any) => w.event));
  for (const event of WEBHOOK_EVENTS) {
    if (existing.has(event)) continue;
    await mondayApi(
      `mutation ($b: ID!, $u: String!, $e: WebhookEventType!) { create_webhook(board_id: $b, url: $u, event: $e) { id } }`,
      { b: boardId, u: fnUrl, e: event },
    );
  }
}

async function triggerSync(boardId: string) {
  const secret = Deno.env.get("SYNC_SECRET");
  const u = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-monday${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
  await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: { boardId } }) });
}

// Wire up Monday for an account if it has a board id. Returns a status string
// for the admin UI; swallows errors so the save itself always succeeds.
async function onboardMonday(boardId: unknown): Promise<string | null> {
  if (!boardId) return null;
  try {
    await ensureMondayWebhooks(String(boardId));
    await triggerSync(String(boardId));
    return "synced";
  } catch (e) {
    return "error: " + String(e);
  }
}

// Pull this account's WhatConverts leads now (best-effort).
async function syncWhatConverts(accountId: string): Promise<string | null> {
  try {
    const secret = Deno.env.get("SYNC_SECRET");
    const u = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-whatconverts${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
    const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }) });
    const j = await r.json().catch(() => ({}));
    return j && j.ok ? "synced" : ("error: " + JSON.stringify(j));
  } catch (e) {
    return "error: " + String(e);
  }
}

// --- Weekly snapshot email (Resend) ----------------------------------------
// Portal domain. Override-able via the PORTAL_URL env var so a future rename is
// a config change, not a code change; display host is derived from it.
const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co";
const PORTAL_HOST = PORTAL_URL.replace(/^https?:\/\//, "");
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Alloy brand tokens (mirror src/styles/01-base.css). Email-safe sans stacks &mdash;
// Poppins/Inter load via the <link> where supported (Apple Mail/iOS), else fall
// back to the system sans stack so it always reads as sans-serif, never serif.
const SANS = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Poppins'," + SANS;
const BRAND = {
  purple: "#381c4f", deep: "#1f0e30", pink: "#d9356e", tint: "#f3f0f7",
  off: "#f8f7fc", fg: "#3f2a55", muted: "#7a6f88", teal: "#2e8b80",
  yellow: "#f5d880", green: "#aed7d0", border: "#ece8f1", lav: "#b9a9cf",
};

function renderSnapshotEmail(acct: any, snap: any): string {
  const items = snap.weekly_snapshot_items || [];
  const g: Record<string, any[]> = { completed: [], upcoming: [], waiting: [], lead: [] };
  items.slice().sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0))
    .forEach((it: any) => { (g[it.kind] || (g[it.kind] = [])).push(it); });
  const name = acct?.short_name || acct?.company || "your team";

  const section = (title: string, list: any[]) => {
    if (!list.length) return "";
    const rows = list.map((it) =>
      `<tr><td style="padding:9px 0;font-family:${SANS};font-size:14px;color:${BRAND.fg};border-bottom:1px solid ${BRAND.border};">${esc(it.text)}${it.meta ? ` <span style="color:${BRAND.muted};font-size:12px;">${esc(it.meta)}</span>` : ""}</td></tr>`).join("");
    return `<tr><td style="padding:28px 0 0;"><div style="font-family:${DISPLAY};font-weight:800;font-size:17px;color:${BRAND.purple};border-bottom:2px solid ${BRAND.border};padding-bottom:9px;">${title}</div></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table></td></tr>`;
  };
  const stat = (n: string | number, label: string, color: string) =>
    `<td align="center" width="33%" style="padding:16px 6px;background:${BRAND.off};border-radius:12px;"><div style="font-family:${DISPLAY};font-weight:800;font-size:26px;color:${color};line-height:1;">${esc(n)}</div><div style="font-family:${SANS};font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:${BRAND.muted};margin-top:7px;">${esc(label)}</div></td>`;
  const leadsStat = (snap.summary_leads || 0) + (snap.leads_value ? ` &middot; ${snap.leads_value}` : "");

  const note = snap.note
    ? `<tr><td style="padding:20px 0 0;"><div style="background:${BRAND.tint};border-radius:12px;padding:16px 18px;"><div style="font-family:${DISPLAY};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${BRAND.purple};margin-bottom:6px;">A note from your Alloy team</div><div style="font-family:${SANS};font-size:14px;color:${BRAND.fg};line-height:1.55;">${esc(snap.note).replace(/\n/g, "<br>")}</div></div></td></tr>`
    : "";

  const bar = (c: string) => `<td height="4" style="height:4px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
  </head><body style="margin:0;background:${BRAND.off};padding:24px 16px;font-family:${SANS};">
  <table align="center" width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
    <tr><td style="background:${BRAND.deep};padding:24px 28px;">
      <div style="color:#ffffff;font-family:${DISPLAY};font-weight:800;font-size:17px;letter-spacing:.01em;">Alloy &middot; Weekly Snapshot</div>
      <div style="color:${BRAND.lav};font-family:${SANS};font-size:12.5px;margin-top:3px;">${esc(name)} &middot; ${esc(snap.week_label || "")}</div>
    </td></tr>
    <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${bar(BRAND.pink)}${bar(BRAND.yellow)}${bar(BRAND.green)}${bar(BRAND.purple)}</tr></table></td></tr>
    <tr><td style="padding:26px 28px 8px;">
      <div style="font-family:${DISPLAY};font-weight:800;font-size:25px;color:${BRAND.purple};line-height:1.25;">${esc(snap.headline || "Your week at a glance")}</div>
    </td></tr>
    <tr><td style="padding:12px 28px 4px;">
      <table width="100%" cellpadding="0" cellspacing="8" role="presentation"><tr>
        ${stat(snap.summary_completed || 0, "Shipped", BRAND.teal)}
        ${stat(leadsStat, "New leads", BRAND.purple)}
        ${stat(snap.summary_waiting || 0, "Waiting on you", BRAND.pink)}
      </tr></table>
    </td></tr>
    <tr><td style="padding:4px 28px 8px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${section("Shipped this week", g.completed)}
      ${section("In motion", g.upcoming)}
      ${section("New leads", g.lead)}
      ${section("Waiting on you", g.waiting)}
      ${note}
    </table></td></tr>
    <tr><td align="center" style="padding:24px 28px 28px;">
      <a href="${PORTAL_URL}" style="display:inline-block;background:${BRAND.purple};color:#ffffff;font-family:${DISPLAY};text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:10px;">Open your portal &rarr;</a>
    </td></tr>
    <tr><td style="background:${BRAND.off};padding:16px 28px;text-align:center;border-top:1px solid ${BRAND.border};">
      <div style="font-family:${SANS};font-size:11.5px;color:${BRAND.muted};">Sent by Alloy Growth Partners &middot; <a href="${PORTAL_URL}" style="color:${BRAND.muted};">${PORTAL_HOST}</a></div>
    </td></tr>
  </table></body></html>`;
}

// Send the published snapshot to the account's portal client users (non-staff
// invites), one private email each. Best-effort: never blocks publishing.
async function sendSnapshotEmail(admin: any, snapshotId: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: 0, error: "RESEND_API_KEY not set" };
  const { data: snap } = await admin.from("weekly_snapshots").select("*, weekly_snapshot_items(*)").eq("id", snapshotId).maybeSingle();
  if (!snap) return { sent: 0, error: "snapshot not found" };
  const { data: acct } = await admin.from("accounts").select("company, short_name, logo_url").eq("id", snap.account_id).maybeSingle();
  // Recipients = non-staff invites MINUS anyone with monthly_snapshot off
  // (centralized in snapshot_recipient_emails; honors per-user notification prefs).
  const { data: emails } = await admin.rpc("snapshot_recipient_emails", { p_account_id: snap.account_id });
  const to = (emails || []).filter(Boolean);
  if (!to.length) return { sent: 0, error: "no client recipients" };

  const html = renderSnapshotEmail(acct, snap);
  const subject = `Your Alloy weekly snapshot &middot; ${snap.week_label || ""}`.trim();
  // Batch = one private message per recipient (no shared To/CC).
  const batch = to.map((addr: string) => ({ from: FROM, to: [addr], subject, html }));
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  if (!res.ok) return { sent: 0, error: `resend ${res.status}: ${await res.text()}` };
  return { sent: to.length };
}

// --- Invite email (Resend) -------------------------------------------------
// Branded "you're invited" email with a one-click sign-in link. We generate the
// link ourselves and send via Resend (not the built-in auth mailer) so it's
// reliable + on-brand, and so failures surface instead of vanishing.
function renderInviteEmail(acct: any, link: string, staff: boolean): string {
  // Email-safe rebuild of the "Growth Portal invite" design handoff: table
  // layout, inline styles, literal hex (CSS vars/flex/gradients degrade
  // gracefully), Helvetica/Arial fallback (Poppins as progressive enhancement).
  const name = acct?.short_name || acct?.company || "your team";
  const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
  const eyebrow = staff ? "Team access" : "Your growth portal is ready";
  const intro = staff
    ? "You've been added to the Alloy Growth Portal &mdash; your team's live view of the work we're driving for clients. One click signs you in, no password needed."
    : "This is your live view of the work we're driving together &mdash; the roadmap, the leads waiting on you, and the value we've built. One click signs you in, no password needed.";
  const tour = [
    { tint: "#fbe2eb", stroke: "#d9356e", name: "Leads waiting on you", desc: "Qualify new opportunities the moment they land.",
      svg: '<polygon points="13 2 4 14 11 14 11 22 20 10 13 10 13 2"></polygon>' },
    { tint: "#dcecf7", stroke: "#4b86b4", name: "Your growth roadmap", desc: "Every market tracked from Foundation to Dominance.",
      svg: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line>' },
    { tint: "#def0ec", stroke: "#3f8f80", name: "The quarterly playbook", desc: "See exactly what we're building &mdash; updated as it ships.",
      svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' },
    { tint: "#fbf2d6", stroke: "#b8902f", name: "Partnership value", desc: "The revenue and momentum we've built together.",
      svg: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>' },
  ];
  const rows = tour.map((it, i) => `
        <tr><td style="padding:15px 0;${i < tour.length - 1 ? "border-bottom:1px solid #e8e4ef;" : ""}">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:${it.tint};border-radius:11px;">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="${it.stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">${it.svg}</svg>
            </td>
            <td style="padding-left:16px;">
              <div style="font-family:${F};font-weight:700;font-size:15.5px;color:#1a0a26;letter-spacing:-0.01em;">${it.name}</div>
              <div style="font-family:${F};font-weight:400;font-size:13.5px;line-height:1.4;color:#8a8395;margin-top:3px;">${it.desc}</div>
            </td>
          </tr></table>
        </td></tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
  <style>@media (prefers-color-scheme:dark){.gp-card{border-color:transparent !important;}}</style>
  </head><body style="margin:0;padding:24px 12px;background:#ebe8f1;font-family:${F};">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" class="gp-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e4ef;box-shadow:0 6px 18px rgba(56,28,79,0.10);">
    <tr><td bgcolor="#381c4f" style="background:#290d41;background-image:linear-gradient(135deg,#381c4f 0%,#290d41 100%);padding:30px 40px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;background:#ffffff;border-radius:12px;">
          <img src="${PORTAL_URL}/alloy-icon.png" width="30" height="30" alt="Alloy" style="display:block;width:30px;height:30px;border:0;"/>
        </td>
        <td style="padding-left:14px;">
          <div style="font-family:${F};font-weight:700;font-size:19px;color:#ffffff;letter-spacing:-0.01em;">Alloy &middot; Growth Portal</div>
          <div style="font-family:${F};font-weight:500;font-size:13px;color:#b3a6c9;letter-spacing:0.04em;margin-top:3px;">${esc(name)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0;font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="20%" height="5" style="height:5px;background:#d9356e;font-size:0;line-height:0;">&nbsp;</td>
        <td width="20%" height="5" style="height:5px;background:#f5d880;font-size:0;line-height:0;">&nbsp;</td>
        <td width="20%" height="5" style="height:5px;background:#a1c8e7;font-size:0;line-height:0;">&nbsp;</td>
        <td width="20%" height="5" style="height:5px;background:#aed7d0;font-size:0;line-height:0;">&nbsp;</td>
        <td width="20%" height="5" style="height:5px;background:#381c4f;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:40px 40px 36px;">
      <div style="font-family:${F};font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#d9356e;margin-bottom:14px;">${eyebrow}</div>
      <div style="font-family:${F};font-weight:700;font-size:32px;line-height:1.12;letter-spacing:-0.01em;color:#1a0a26;margin:0 0 16px;">You're invited to<br>the Alloy Growth Portal</div>
      <div style="font-family:${F};font-weight:400;font-size:16px;line-height:1.62;color:#555555;margin:0 0 30px;">${intro}</div>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="#d9356e" style="border-radius:12px;background:#d9356e;box-shadow:0 8px 24px rgba(217,53,110,0.25);">
          <a href="${link}" style="display:inline-block;padding:18px 32px;font-family:${F};font-size:16px;font-weight:700;letter-spacing:0.01em;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px;">Accept invite &amp; sign in &nbsp;&rarr;</a>
        </td>
      </tr></table>
      <div style="border-top:1px solid #e8e4ef;margin-top:38px;padding-top:26px;">
        <div style="font-family:${F};font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#8a8395;margin-bottom:8px;">Here's what's waiting inside</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
        </table>
      </div>
      <div style="font-family:${F};font-weight:400;font-size:13px;line-height:1.6;color:#8a8395;margin-top:30px;">This sign-in link is single-use and expires soon. If it has expired, just enter your email at <a href="${PORTAL_URL}" style="color:#555555;text-decoration:underline;">${PORTAL_HOST}</a> for a fresh one.</div>
    </td></tr>
    <tr><td bgcolor="#f8f7fc" style="background:#f8f7fc;border-top:1px solid #e8e4ef;padding:20px 40px;text-align:center;">
      <div style="font-family:${F};font-weight:400;font-size:12.5px;color:#8a8395;">Sent by Alloy Growth Partners &middot; <a href="${PORTAL_URL}" style="color:#555555;text-decoration:none;">${PORTAL_HOST}</a></div>
    </td></tr>
  </table>
  </body></html>`;
}

// Generate a sign-in link (invite for new users, magic link for existing) and
// email it via Resend. Returns { emailed, error } so callers report honestly.
async function sendInviteEmail(
  admin: any, email: string, accountId: string, redirectTo: string, isNew: boolean, staff: boolean,
): Promise<{ emailed: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { emailed: false, error: "RESEND_API_KEY not set" };
  // 'invite' creates the auth user (&rarr; signup trigger provisions the profile
  // from the invite row); 'magiclink' issues a sign-in link for an existing
  // user. generateLink returns the link WITHOUT sending &mdash; we send it ourselves.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: isNew ? "invite" : "magiclink",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  const link = linkData?.properties?.action_link;
  if (linkErr || !link) return { emailed: false, error: `generateLink: ${linkErr?.message || "no link"}` };
  const { data: acct } = await admin.from("accounts").select("company, short_name, logo_url").eq("id", accountId).maybeSingle();
  const subject = staff
    ? "You've been added to the Alloy team portal"
    : `You're invited to the Alloy Growth Portal &middot; ${acct?.short_name || acct?.company || ""}`.trim().replace(/ &middot;\s*$/, "");
  const html = renderInviteEmail(acct, link, staff);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], subject, html }),
  });
  if (!res.ok) return { emailed: false, error: `resend ${res.status}: ${await res.text()}` };
  return { emailed: true };
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
      .from("profiles").select("is_staff").eq("id", user.id).maybeSingle();
    if (!me?.is_staff) return json({ error: "forbidden" }, 403);

    // Service role for the actual admin operations.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "list_accounts") {
      const { data, error } = await admin.from("accounts").select("*").order("company");
      if (error) throw error;
      return json({ accounts: data });
    }

    if (action === "create_account") {
      const fields = pick(body, ACCOUNT_FIELDS);
      if (!fields.company) return json({ error: "company required" }, 400);
      const { data, error } = await admin.from("accounts").insert(fields).select().single();
      if (error) throw error;
      const monday = await onboardMonday(data.monday_board_id);
      const whatconverts = data.whatconverts_profile_id ? await syncWhatConverts(data.id) : null;
      return json({ account: data, monday, whatconverts });
    }

    if (action === "update_account") {
      if (!body.id) return json({ error: "id required" }, 400);
      const patch = pick(body, ACCOUNT_FIELDS);
      const { data, error } = await admin
        .from("accounts").update(patch).eq("id", body.id).select().single();
      if (error) throw error;
      // Only (re)wire Monday when the board id was part of this update.
      const monday = patch.monday_board_id !== undefined
        ? await onboardMonday(data.monday_board_id) : null;
      const whatconverts = patch.whatconverts_profile_id !== undefined && data.whatconverts_profile_id
        ? await syncWhatConverts(data.id) : null;
      return json({ account: data, monday, whatconverts });
    }

    if (action === "delete_account") {
      if (!body.id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("accounts").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "list_invites") {
      const { data, error } = await admin
        .from("account_invites").select("*").eq("account_id", body.account_id).order("email");
      if (error) throw error;
      return json({ invites: data });
    }

    if (action === "add_invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !body.account_id) return json({ error: "email and account_id required" }, 400);
      const row = {
        email,
        account_id: body.account_id,
        role: ["admin", "staff", "owner", "accounting"].includes(body.role) ? body.role : "owner",
        is_staff: !!body.is_staff,
        name: body.name || null,
        initials: body.initials || null,
      };
      // An email belongs to one account: clear any prior invite, then insert.
      await admin.from("account_invites").delete().eq("email", email);
      const { error: invErr } = await admin.from("account_invites").insert(row);
      if (invErr) throw invErr;

      const { data: uid } = await admin.rpc("auth_uid_by_email", { p_email: email });
      if (uid) {
        // Existing user: provision/refresh their profile now (the signup
        // trigger only fires for brand-new users).
        await admin.from("profiles").upsert({
          id: uid, account_id: row.account_id, role: row.role,
          is_staff: row.is_staff, name: row.name, initials: row.initials,
        }, { onConflict: "id" });
      }
      // Always email a working sign-in link &mdash; new OR existing user. (New users
      // are created by the 'invite' link; the signup trigger then provisions
      // their profile from the invite row above.)
      const { emailed, error: emailError } = await sendInviteEmail(
        admin, email, row.account_id, body.redirectTo || PORTAL_URL, !uid, row.is_staff,
      );
      return json({ ok: true, emailed, emailError });
    }

    if (action === "remove_invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json({ error: "email required" }, 400);
      await admin.from("account_invites").delete().eq("email", email);
      // Fully revoke access. Delete their profile AND their auth user, so they
      // can't request a fresh magic link and sign back in. No user-owned data
      // is retained (events are analytics only), so a hard delete is safe.
      const { data: uid } = await admin.rpc("auth_uid_by_email", { p_email: email });
      let authDeleted = false;
      if (uid) {
        await admin.from("profiles").delete().eq("id", uid);
        const { error: delErr } = await admin.auth.admin.deleteUser(uid);
        authDeleted = !delErr;
      }
      return json({ ok: true, authDeleted });
    }

    if (action === "portfolio") {
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const [accts, acts, projs, invs, evs] = await Promise.all([
        admin.from("accounts").select("id, company, short_name, tier, logo_url, goal_label, goal_current, goal_target"),
        admin.from("action_items").select("account_id"),
        admin.from("projects").select("account_id, due_date, status"),
        admin.from("account_invites").select("account_id"),
        admin.from("events").select("account_id, user_id, created_at").gte("created_at", since),
      ]);
      const openActions: Record<string, number> = {};
      for (const a of acts.data || []) openActions[a.account_id] = (openActions[a.account_id] || 0) + 1;
      const pastDue: Record<string, number> = {};
      for (const p of projs.data || []) {
        if (p.due_date && p.due_date < today && p.status !== "live") {
          pastDue[p.account_id] = (pastDue[p.account_id] || 0) + 1;
        }
      }
      const invited: Record<string, number> = {};
      for (const iv of invs.data || []) invited[iv.account_id] = (invited[iv.account_id] || 0) + 1;
      const lastActive: Record<string, string> = {};
      const usersByAcct: Record<string, Set<string>> = {};
      for (const e of evs.data || []) {
        if (!lastActive[e.account_id] || e.created_at > lastActive[e.account_id]) lastActive[e.account_id] = e.created_at;
        if (e.user_id) (usersByAcct[e.account_id] || (usersByAcct[e.account_id] = new Set())).add(e.user_id);
      }
      const clients = (accts.data || []).map((a: any) => ({
        id: a.id, company: a.company, short_name: a.short_name, tier: a.tier, logo_url: a.logo_url,
        goal_label: a.goal_label, goal_current: a.goal_current || 0, goal_target: a.goal_target || 0,
        openActions: openActions[a.id] || 0,
        pastDue: pastDue[a.id] || 0,
        invited: invited[a.id] || 0,
        activeUsers: usersByAcct[a.id] ? usersByAcct[a.id].size : 0,
        lastActive: lastActive[a.id] || null,
      })).sort((x: any, y: any) =>
        (y.openActions + y.pastDue) - (x.openActions + x.pastDue) ||
        String(x.company).localeCompare(String(y.company)));
      return json({ clients });
    }

    if (action === "analytics") {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: evs, error } = await admin.from("events")
        .select("account_id, user_id, type, meta, created_at")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(20000);
      if (error) throw error;
      const { data: accts } = await admin.from("accounts").select("id, short_name, company");
      const nameOf: Record<string, string> = {};
      for (const a of accts || []) nameOf[a.id] = a.short_name || a.company;
      // user display names + how many people are invited per account
      const { data: profs } = await admin.from("profiles").select("id, name, is_staff");
      const userName: Record<string, string> = {};
      for (const p of profs || []) userName[p.id] = p.name || "";

      // Alloy is not a client. Build the set of user_ids to exclude from
      // analytics entirely: anyone flagged is_staff, plus anyone whose email is
      // on an Alloy domain. Combined with dropping events whose account doesn't
      // resolve, this clears the legacy "Unknown" row (old staff / null-account
      // activity recorded before tracking started skipping staff).
      const alloyUser = new Set<string>();
      for (const p of profs || []) if ((p as any).is_staff) alloyUser.add(p.id);
      try {
        for (let page = 1; ; page++) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          const us = list?.users || [];
          for (const u of us) {
            const domain = String(u.email || "").toLowerCase().split("@")[1] || "";
            if (domain.includes("alloy")) alloyUser.add(u.id);
          }
          if (us.length < 1000) break;
        }
      } catch { /* best-effort; is_staff still filters Alloy users */ }
      const { data: invs } = await admin.from("account_invites").select("account_id");
      const invitedCount: Record<string, number> = {};
      for (const iv of invs || []) invitedCount[iv.account_id] = (invitedCount[iv.account_id] || 0) + 1;

      // 14-day buckets for the activity chart.
      const daily: Record<string, number> = {};
      const days: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push(key); daily[key] = 0;
      }

      const perAccount: Record<string, any> = {};
      const perUser: Record<string, any> = {};
      const screens: Record<string, number> = {};
      const users = new Set<string>();
      let logins = 0, views = 0;

      for (const e of evs || []) {
        if (e.user_id && alloyUser.has(e.user_id)) continue; // Alloy isn't a client
        if (!e.account_id || !nameOf[e.account_id]) continue; // drop legacy "Unknown"
        const aid = e.account_id;
        const pa = perAccount[aid] || (perAccount[aid] = {
          account_id: aid, name: nameOf[aid] || "Unknown",
          logins: 0, views: 0, events: 0, users: new Set<string>(), lastActive: e.created_at,
        });
        pa.events++;
        if (e.created_at > pa.lastActive) pa.lastActive = e.created_at;
        if (e.user_id) {
          pa.users.add(e.user_id); users.add(e.user_id);
          const pu = perUser[e.user_id] || (perUser[e.user_id] = {
            user_id: e.user_id, account_id: aid, logins: 0, views: 0, events: 0, lastActive: e.created_at,
          });
          pu.events++;
          if (e.created_at > pu.lastActive) pu.lastActive = e.created_at;
          if (e.type === "login") pu.logins++;
          if (e.type === "view") pu.views++;
        }
        if (e.type === "login") { pa.logins++; logins++; }
        if (e.type === "view") {
          pa.views++; views++;
          const s = (e.meta && e.meta.screen) || "?";
          screens[s] = (screens[s] || 0) + 1;
        }
        const dk = e.created_at.slice(0, 10);
        if (dk in daily) daily[dk]++;
      }

      const perAccountArr = Object.values(perAccount)
        .map((p: any) => ({ ...p, users: p.users.size, invited: invitedCount[p.account_id] || 0 }))
        .sort((a: any, b: any) => String(b.lastActive).localeCompare(String(a.lastActive)));
      const perUserArr = Object.values(perUser)
        .map((u: any) => ({
          ...u,
          name: userName[u.user_id] || `User ${String(u.user_id).slice(0, 6)}`,
          account: nameOf[u.account_id] || "Unknown",
        }))
        .sort((a: any, b: any) => String(b.lastActive).localeCompare(String(a.lastActive)));
      const screensArr = Object.entries(screens)
        .map(([screen, count]) => ({ screen, count })).sort((a, b) => b.count - a.count);
      const dailyArr = days.map((d) => ({ date: d, count: daily[d] }));

      return json({
        analytics: {
          totals: { logins, views, activeUsers: users.size, activeAccounts: perAccountArr.length },
          perAccount: perAccountArr, perUser: perUserArr, screens: screensArr, daily: dailyArr,
        },
      });
    }

    // --- weekly snapshots: review queue + edit + publish ---
    if (action === "list_snapshots") {
      const q = admin.from("weekly_snapshots").select("*, weekly_snapshot_items(*)").order("created_at", { ascending: false });
      const { data, error } = body.account_id ? await q.eq("account_id", body.account_id) : await q;
      if (error) throw error;
      return json({ snapshots: data });
    }

    if (action === "pending_snapshots") {
      // Count of draft snapshots per account (for the Alloy Home review badge).
      const { data, error } = await admin.from("weekly_snapshots").select("account_id").eq("status", "draft");
      if (error) throw error;
      const byAccount: Record<string, number> = {};
      for (const s of data || []) byAccount[s.account_id] = (byAccount[s.account_id] || 0) + 1;
      return json({ total: (data || []).length, byAccount });
    }

    if (action === "snapshot_queue") {
      // Triaged review queue: one row per client with counts + anomaly flags,
      // so staff react to exceptions instead of checking every client.
      const [{ data: accts }, { data: snaps }] = await Promise.all([
        admin.from("accounts").select("id, company, short_name, logo_url"),
        admin.from("weekly_snapshots")
          .select("id, account_id, status, created_at, period_end, summary_completed, summary_waiting, summary_leads, leads_value, flags, headline")
          .order("created_at", { ascending: false }),
      ]);
      const now = Date.now();
      const byAcct: Record<string, { latest: any; draft: any }> = {};
      for (const s of snaps || []) {
        const e = byAcct[s.account_id] || (byAcct[s.account_id] = { latest: null, draft: null });
        if (!e.latest) e.latest = s; // ordered desc &rarr; first seen is newest
        if (!e.draft && s.status === "draft") e.draft = s;
      }
      const rows = (accts || []).map((a: any) => {
        const e = byAcct[a.id] || { latest: null, draft: null };
        const src = e.draft || e.latest;
        const flags = ((src && src.flags) || []).slice();
        if (!e.latest) flags.push({ level: "warn", msg: "No snapshot generated yet." });
        else if (e.latest.period_end && (now - new Date(e.latest.period_end).getTime()) > 6 * 864e5) {
          flags.push({ level: "warn", msg: "No fresh snapshot this week &mdash; generation may have skipped." });
        }
        return {
          id: a.id, name: a.short_name || a.company, logo_url: a.logo_url,
          status: e.draft ? "draft" : (e.latest ? e.latest.status : "none"),
          draftId: e.draft ? e.draft.id : null,
          headline: (src && src.headline) || "",
          shipped: (src && src.summary_completed) || 0,
          waiting: (src && src.summary_waiting) || 0,
          leads: (src && src.summary_leads) || 0,
          leadsValue: (src && src.leads_value) || "",
          flags,
        };
      }).sort((x: any, y: any) =>
        (y.flags.length - x.flags.length) || ((y.draftId ? 1 : 0) - (x.draftId ? 1 : 0)) || String(x.name).localeCompare(String(y.name)));
      return json({ queue: rows, drafts: rows.filter((r: any) => r.draftId).length, flagged: rows.filter((r: any) => r.flags.length).length });
    }

    if (action === "regenerate_snapshot") {
      // Staff "refresh from latest": re-pull this client's Monday board and
      // rebuild the draft, keeping the edited headline + note.
      if (!body.account_id) return json({ error: "account_id required" }, 400);
      const secret = Deno.env.get("SYNC_SECRET");
      const u = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-snapshot${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
      const r = await fetch(u, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: body.account_id, preserve: true }),
      });
      const result = await r.json().catch(() => ({}));
      return json({ ok: true, result });
    }

    if (action === "update_snapshot") {
      if (!body.id) return json({ error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
      if (body.headline !== undefined) patch.headline = body.headline;
      if (body.note !== undefined) patch.note = body.note;
      const { data, error } = await admin.from("weekly_snapshots").update(patch).eq("id", body.id).select().single();
      if (error) throw error;
      return json({ snapshot: data });
    }

    if (action === "approve_snapshot") {
      if (!body.id) return json({ error: "id required" }, 400);
      const { data: snap, error: e1 } = await admin
        .from("weekly_snapshots").select("account_id").eq("id", body.id).maybeSingle();
      if (e1) throw e1;
      if (!snap) return json({ error: "not found" }, 404);
      // Demote the prior current, publish this one.
      await admin.from("weekly_snapshots").update({ is_current: false })
        .eq("account_id", snap.account_id).eq("is_current", true);
      const { error: e2 } = await admin.from("weekly_snapshots")
        .update({ status: "published", is_current: true, approved_at: new Date().toISOString() })
        .eq("id", body.id);
      if (e2) throw e2;
      // Email the client's portal users (best-effort &mdash; publish already stuck).
      const email = body.skipEmail ? { sent: 0, skipped: true } : await sendSnapshotEmail(admin, body.id);
      if (email.sent > 0) await admin.from("weekly_snapshots").update({ sent_at: new Date().toISOString() }).eq("id", body.id);
      return json({ ok: true, email });
    }

    // --- Newsletter intake: open a round, track submissions, close ---
    if (action === "newsletter_list") {
      // Every request + its account name, newest first. Powers the admin tracker.
      // Also roll up newsletter_open / newsletter_submit events per request →
      // engagement analytics (who opened, how many clicks, who filled it out).
      const [{ data: reqs, error }, { data: accts }, { data: evs }, { data: profs }] = await Promise.all([
        admin.from("newsletter_requests").select("*").order("created_at", { ascending: false }),
        admin.from("accounts").select("id, company, short_name"),
        admin.from("events").select("user_id, type, meta, created_at").in("type", ["newsletter_open", "newsletter_submit"]),
        admin.from("profiles").select("id, name"),
      ]);
      if (error) throw error;
      const nameOf: Record<string, any> = {};
      for (const a of accts || []) nameOf[a.id] = a;
      const userName: Record<string, string> = {};
      for (const p of profs || []) userName[p.id] = p.name || "";

      // Group events by the request id carried in meta.
      const agg: Record<string, { opens: number; openers: Record<string, number>; lastOpen: string | null; submits: number; submitters: Record<string, number> }> = {};
      for (const e of evs || []) {
        const rid = e.meta && (e.meta as any).requestId;
        if (!rid) continue;
        const g = agg[rid] || (agg[rid] = { opens: 0, openers: {}, lastOpen: null, submits: 0, submitters: {} });
        if (e.type === "newsletter_open") {
          g.opens++;
          if (e.user_id) g.openers[e.user_id] = (g.openers[e.user_id] || 0) + 1;
          if (!g.lastOpen || e.created_at > g.lastOpen) g.lastOpen = e.created_at;
        } else if (e.type === "newsletter_submit") {
          g.submits++;
          if (e.user_id) g.submitters[e.user_id] = (g.submitters[e.user_id] || 0) + 1;
        }
      }

      const requests = (reqs || []).map((r: any) => {
        const g = agg[r.id];
        const openers = g
          ? Object.entries(g.openers).map(([uid, count]) => ({ name: userName[uid] || "A team member", count })).sort((a, b) => b.count - a.count)
          : [];
        return {
          ...r,
          account_name: (nameOf[r.account_id]?.short_name) || (nameOf[r.account_id]?.company) || "—",
          account_company: nameOf[r.account_id]?.company || "",
          analytics: {
            opens: g ? g.opens : 0,          // total "Open Form" clicks
            openerCount: openers.length,      // distinct people who opened it
            openers,                          // [{ name, count }]
            lastOpen: g ? g.lastOpen : null,
            submits: g ? g.submits : 0,
          },
        };
      });
      return json({ requests, accounts: (accts || []).sort((a: any, b: any) => String(a.company).localeCompare(String(b.company))) });
    }

    if (action === "newsletter_open") {
      // Open a round for a hand-picked set of clients. Skips any client that
      // already has a live (open or submitted) round — one banner at a time.
      const ids: string[] = Array.isArray(body.accountIds) ? body.accountIds.filter(Boolean).map(String) : [];
      if (!ids.length) return json({ error: "select at least one client" }, 400);
      const title = String(body.title || "").trim() || "Newsletter";
      const due = body.due_date ? String(body.due_date) : null;
      const { data: live } = await admin
        .from("newsletter_requests").select("account_id").in("account_id", ids).neq("status", "closed");
      const already = new Set((live || []).map((r: any) => r.account_id));
      const toInsert = ids.filter((id) => !already.has(id));
      let opened = 0;
      if (toInsert.length) {
        const rows = toInsert.map((account_id) => ({
          account_id, title, due_date: due, status: "open", created_by: user.id,
        }));
        const { error } = await admin.from("newsletter_requests").insert(rows);
        if (error) throw error;
        opened = rows.length;
      }
      return json({ ok: true, opened, skipped: ids.length - opened });
    }

    if (action === "newsletter_close") {
      if (!body.id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("newsletter_requests").update({ status: "closed" }).eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "newsletter_delete") {
      if (!body.id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("newsletter_requests").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = String(e);
    // Friendly guardrail message for the unique Monday-board-id indexes &mdash; a
    // board may belong to only one account (prevents cross-tenant data bleed).
    if (/accounts_monday_(board|roadmap_board|program_board)_id_uniq/.test(msg) || /duplicate key/i.test(msg)) {
      const which = /roadmap_board/.test(msg) ? "Markets (roadmap) board"
        : /program_board/.test(msg) ? "Program board"
        : "Monday board";
      return json({ error: `That ${which} ID is already assigned to another client. Each board can belong to only one account.` }, 409);
    }
    return json({ error: msg }, 500);
  }
});
