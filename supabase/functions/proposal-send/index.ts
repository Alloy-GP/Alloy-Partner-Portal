import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-send — email the board their magic-link proposal, and mark it sent.
//
// Flow: cockpit Send → here. We (1) AUTHORIZE by reading the proposal with the
// CALLER's session (RLS — you can only send proposals you can see), (2) build
// the magic link <baseUrl>/proposals/board/<board_token>, (3) render a
// board-facing email (design handoff #20), (4) deliver via Resend, (5) only on
// success, mark the proposal sent (status + sent_at). Returns {sent,to}.
//
// verify_jwt: true — a signed-in staffer/client triggers it (the session JWT
// is the auth; RLS does the per-account authorization on the read).
//
// from address = the per-CAM proposal_from_email when set + verified in Resend
// (e.g. proposals@cmgt.org); otherwise the shared alloygp.co domain with the
// CAM's display name. NO price anywhere in the email (per the client).

const FROM_DOMAIN = "noreply@alloygp.co";
const PORTAL_URL = (Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const NUMWORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numWord = (n: number) => (n >= 0 && n <= 10 ? NUMWORDS[n] : String(n));

// CMGT theme (handoff #20). Themeable per CAM later — swap these + the wordmark.
const T = {
  brand: "#2b2c6c", brand2: "#36418f", brandDeep: "#161a44",
  accent: "#2f9e6f", accentDeep: "#25805a",
  ink: "#1b1430", body: "#57506a", muted: "#8a8395",
  hairline: "#e9e5f0", tint: "#f7f5fb", page: "#e7e3ee", checkBg: "#e6f4ee",
};
const FD = `'Poppins',"Helvetica Neue",Arial,sans-serif`; // display
const FB = `'Inter',"Helvetica Neue",Arial,sans-serif`;   // body

interface EmailData {
  cam: string; camFull: string; tagline: string;
  firstName: string; contactFull: string; contactRole: string;
  community: string; city: string; homes: number; type: string; status: string;
  priorities: string[]; link: string; expires: string;
  camDomain: string; camEmail: string;
}

function priorityRows(items: string[]): string {
  const chip = `<span style="display:inline-block;width:19px;height:19px;line-height:19px;text-align:center;border-radius:999px;background:${T.checkBg};color:${T.accent};font-weight:800;font-size:11px;vertical-align:middle;margin-right:9px;">&#10003;</span>`;
  const cell = (label: string) =>
    `<td class="pricell" width="50%" valign="top" style="padding:7px 0;font-family:${FB};font-size:13.5px;font-weight:500;color:${T.ink};line-height:1.4;">${chip}${esc(label)}</td>`;
  let rows = "";
  for (let i = 0; i < items.length; i += 2) {
    rows += `<tr>${cell(items[i])}${items[i + 1] ? cell(items[i + 1]) : '<td class="pricell" width="50%"></td>'}</tr>`;
  }
  return rows;
}

function renderEmail(d: EmailData): string {
  const askCell = (k: string, v: string, sub: string, first: boolean) =>
    `<td class="askcell" width="33.33%" valign="top" style="padding:14px 16px;${first ? "" : `border-left:1px solid ${T.hairline};`}">
      <div style="font-family:${FB};font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${T.muted};">${esc(k)}</div>
      <div style="font-family:${FD};font-size:17px;font-weight:700;color:${T.ink};margin-top:5px;line-height:1.2;">${esc(v)}</div>
      <div style="font-family:${FB};font-size:12px;font-weight:500;color:${T.muted};margin-top:3px;">${esc(sub)}</div>
    </td>`;
  const priBlock = d.priorities.length
    ? `<tr><td style="padding:22px 30px 4px;">
        <div style="border-top:1px solid ${T.hairline};padding-top:18px;">
          <div style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:8px;">The priorities we answered</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${priorityRows(d.priorities)}</table>
        </div>
      </td></tr>`
    : "";
  const priLine = d.priorities.length
    ? `the <b style="color:${T.ink};">${numWord(d.priorities.length)} priorities your board raised</b>, point by point`
    : `the specific priorities your board raised`;

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Built around ${esc(d.community)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table,td{ mso-table-lspace:0pt; mso-table-rspace:0pt; }
  body{ margin:0!important; padding:0!important; width:100%!important; }
  @media only screen and (max-width:560px){
    .container{ width:100%!important; border-radius:0!important; }
    .px{ padding-left:22px!important; padding-right:22px!important; }
    .hero{ padding:22px 22px 32px!important; }
    .hero-gap{ height:40px!important; line-height:40px!important; }
    .hero-h1{ font-size:29px!important; }
    .askcell{ display:block!important; width:100%!important; border-left:0!important; border-top:1px solid ${T.hairline}; }
    .askcell:first-child{ border-top:0; }
    .pricell{ display:block!important; width:100%!important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${T.page};font-family:${FB};">
<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;font-size:1px;line-height:1px;color:${T.page};">Your tailored management proposal for ${esc(d.community)}, built around what your board told us.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.page};"><tr><td align="center" style="padding:24px 12px;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${T.hairline};">

    <!-- 1 brand header + hero — ONE continuous dark gradient block -->
    <tr><td class="hero" bgcolor="#1a1d44" style="background:#1a1d44;background-image:linear-gradient(157deg,${T.brand2} 0%,${T.brand} 30%,#1b1e47 64%,#101230 100%);padding:24px 34px 38px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" style="font-family:${FD};font-size:19px;font-weight:800;letter-spacing:.01em;color:#ffffff;">${esc(d.cam)}</td>
        <td align="right" style="font-family:${FD};font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6);">${esc(d.tagline)}</td>
      </tr></table>
      <div class="hero-gap" style="height:60px;line-height:60px;font-size:0;">&nbsp;</div>
      <div style="font-family:${FD};font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;margin-bottom:13px;"><span style="display:inline-block;width:18px;height:2px;background:${T.accent};vertical-align:middle;margin-right:8px;"></span>Your management proposal</div>
      <div class="hero-h1" style="font-family:${FD};font-size:37px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:#ffffff;margin:0;">Built around<br>${esc(d.community)}.</div>
      <div style="font-family:${FB};font-size:14px;color:rgba(255,255,255,.82);margin-top:14px;">Prepared for ${esc(d.contactFull)} &amp; the board.</div>
    </td></tr>

    <!-- 3 what you told us -->
    <tr><td class="px" style="padding:26px 30px 6px;">
      <div style="font-family:${FD};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${T.accent};margin-bottom:11px;">Here's what you told us</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${T.hairline};border-radius:12px;">
        <tr>
          ${askCell("Community", d.community, d.city || "—", true)}
          ${askCell("Homes", String(d.homes || "—"), "units under management", false)}
          ${askCell("Type", d.type || "—", d.status || "", false)}
        </tr>
      </table>
    </td></tr>

    <!-- 4 body -->
    <tr><td class="px" style="padding:26px 30px 4px;">
      <div style="font-family:${FD};font-size:16px;font-weight:700;color:${T.ink};margin-bottom:10px;">Hi ${esc(d.firstName)},</div>
      <div style="font-family:${FB};font-size:15px;line-height:1.62;color:${T.body};">Thank you for telling us about <b style="color:${T.ink};">${esc(d.community)}</b>. We didn't send a generic pitch — we built this proposal around ${priLine}.</div>
    </td></tr>
    ${priBlock}

    <!-- 5 CTA -->
    <tr><td class="px" style="padding:24px 30px 6px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(d.link)}" style="height:54px;v-text-anchor:middle;width:540px;" arcsize="22%" strokecolor="${T.accent}" fillcolor="${T.accent}"><w:anchorlock/><center style="color:#ffffff;font-family:${FD};font-size:16px;font-weight:700;">View your proposal &rarr;</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${esc(d.link)}" style="display:block;background:${T.accent};color:#ffffff;font-family:${FD};font-size:16px;font-weight:700;text-align:center;text-decoration:none;padding:17px 28px;border-radius:12px;">View your proposal &rarr;</a>
      <!--<![endif]-->
    </td></tr>

    <!-- 6 secure note -->
    <tr><td class="px" style="padding:14px 30px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.tint};border-radius:10px;"><tr>
        <td valign="top" width="26" style="padding:13px 0 13px 14px;color:${T.brand2};font-family:${FB};font-weight:800;">&#128274;</td>
        <td style="padding:13px 14px 13px 8px;font-family:${FB};font-size:12.5px;line-height:1.55;color:${T.muted};"><b style="color:${T.body};">One-tap secure link — no password.</b> It signs you in automatically and works only from this email.${d.expires ? ` Expires ${esc(d.expires)}.` : ""}</td>
      </tr></table>
    </td></tr>

    <!-- 7 signature -->
    <tr><td class="px" style="padding:18px 30px 24px;">
      <div style="font-family:${FD};font-size:14.5px;font-weight:700;color:${T.ink};">&mdash; The ${esc(d.cam)} team</div>
      <div style="font-family:${FB};font-size:12.5px;color:${T.muted};margin-top:2px;">Client Partnerships &middot; ${esc(d.camFull)}</div>
    </td></tr>

    <!-- 8 footer -->
    <tr><td bgcolor="${T.tint}" style="background:${T.tint};border-top:1px solid ${T.hairline};padding:18px 30px;text-align:center;">
      <div style="font-family:${FD};font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${T.body};">${esc(d.camFull)}</div>
      <div style="font-family:${FB};font-size:12px;color:${T.muted};margin-top:6px;line-height:1.6;">${d.camDomain ? `<a href="https://${esc(d.camDomain)}" style="color:${T.muted};text-decoration:none;">${esc(d.camDomain)}</a> &middot; ` : ""}${esc(d.camEmail)}<br>Sent to ${esc(d.contactFull)}${d.contactRole ? `, ${esc(d.contactRole)}` : ""} &middot; ${esc(d.community)}</div>
    </td></tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY not set" }, 500);
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") || "";

    const body = await req.json().catch(() => ({}));
    const leadKey = String(body?.leadKey || "").trim();
    const accountId = String(body?.accountId || "").trim();
    const toOverride = String(body?.to || "").trim();
    let base = String(body?.baseUrl || "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(base)) base = PORTAL_URL; // only accept real origins; else portal default
    if (!leadKey || !accountId) return json({ error: "leadKey + accountId required" }, 400);

    // AUTHORIZE via RLS: read the proposal as the CALLER. Returns nothing if
    // they can't access this account → 403. (No service role for this read.)
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: prop, error: readErr } = await userClient
      .from("proposals")
      .select("id, account_id, board_token, email, community, first_name, contact, contact_role, city, homes, meta_type, meta_status, link_expires, match_snapshot")
      .eq("account_id", accountId).eq("lead_key", leadKey).maybeSingle();
    if (readErr) return json({ error: "read_failed", detail: readErr.message }, 500);
    if (!prop) return json({ error: "not_authorized_or_missing" }, 403);

    const recipient = (toOverride || prop.email || "").trim();
    if (!isEmail(recipient)) return json({ error: "no valid recipient email" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: acct } = await admin.from("accounts").select("company, short_name, proposal_from_email").eq("id", prop.account_id).maybeSingle();
    const cam = acct?.short_name || acct?.company || "Your management company";
    const camFull = acct?.company || cam;
    const fromEmail = (acct?.proposal_from_email || "").trim() || FROM_DOMAIN;
    const camDomain = (fromEmail.split("@")[1] || "").trim();
    const link = `${base}/proposals/board/${prop.board_token}`;

    // Priorities = the lead's matched concerns (from the persisted LLM/engine
    // snapshot). Labels only; capped so the email stays scannable. No price.
    const priorities = Array.isArray(prop.match_snapshot?.concerns)
      ? prop.match_snapshot.concerns.map((c: any) => String(c?.label || "").trim()).filter(Boolean).slice(0, 6)
      : [];

    const html = renderEmail({
      cam, camFull, tagline: "We Manage. You Live.",
      firstName: prop.first_name || "there",
      contactFull: prop.contact || prop.first_name || "your board",
      contactRole: prop.contact_role || "",
      community: prop.community || "your community",
      city: prop.city || "", homes: prop.homes || 0,
      type: prop.meta_type || "", status: prop.meta_status || "",
      priorities, link, expires: prop.link_expires || "",
      camDomain, camEmail: fromEmail,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${cam} <${fromEmail}>`, to: [recipient], subject: `Built around ${prop.community} — your management proposal`, html }),
    });
    if (!res.ok) return json({ error: `resend ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);

    // Only NOW mark it sent (don't claim sent if the email failed).
    await admin.from("proposals").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", prop.id);

    return json({ sent: true, to: recipient, link });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
