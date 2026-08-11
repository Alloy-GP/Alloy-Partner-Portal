import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-send — email the board their magic-link proposal, and mark it sent.
//
// Flow: cockpit Send → here. We (1) AUTHORIZE by reading the proposal with the
// CALLER's session (RLS — you can only send proposals you can see), (2) build
// the magic link <baseUrl>/proposals/board/<board_token>, (3) render the
// board-facing email, (4) deliver via Resend, (5) only on success, mark the
// proposal sent (status + sent_at). Returns {sent,to,cc}.
//
// TWO MODES, one function:
//   • send (no `message`) — the full proposal email + marks the row sent.
//   • nudge (`message` given) — a short follow-up that renders the CAM's typed
//     message as the body, threaded as `Re: <original subject>`, same secure
//     link. A nudge does NOT re-stamp sent_at/status or clear a board verdict:
//     it's a follow-up, not a revised proposal, so the Sent-stage analytics
//     window and link expiry stay anchored to the original send.
// Both modes accept `cc` (string or string[]) for board members / co-signers.
//
// EMAIL = the email-safe handoff (Alloy Client Portal #21): table layout, all
// inline styles, SOLID colors (no gradients), Arial stack (no web fonts),
// Unicode icons (no SVG/images), bulletproof VML button. Renders in Gmail /
// Apple Mail / Outlook. NO price anywhere (per the client).
//
// verify_jwt: true — a signed-in staffer/client triggers it; RLS does the
// per-account authorization on the read.

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

// CC list — accepts a string ("a@x.com, b@y.com") or an array. Normalizes,
// validates, dedupes, and drops the primary recipient (Resend would otherwise
// deliver twice). Capped so a paste-gone-wrong can't fan out a blast.
const CC_MAX = 10;
function parseCc(raw: unknown, primary: string): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[,;\s]+/);
  const seen = new Set([primary.toLowerCase()]);
  const out: string[] = [];
  for (const p of parts) {
    const e = p.trim();
    if (!e || !isEmail(e) || seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    out.push(e);
    if (out.length >= CC_MAX) break;
  }
  return out;
}

// Solid brand palette (handoff #21). Theme per CAM = swap these hex strings.
const C = {
  brand: "#2b2c6c", navy: "#1a1b4a", green: "#2f9e6f", greenTint: "#e4f3ec",
  ink: "#1b1430", body: "#57506a", muted: "#8a8395",
  hairline: "#e9e5f0", tint: "#f7f5fb", page: "#e7e3ee", heroSub: "#b9bce0", heroEy: "#c8ccf0", tag: "#aab0e0",
};
const FA = "Arial,Helvetica,sans-serif";

// The proposal's assigned rep (owner initials → who signs the email). Mirrors
// the cockpit owner picker + the board doc's rep map.
const REP: Record<string, { name: string; role: string }> = {
  AB: { name: "Amanda Betancourt", role: "COO" },
  JR: { name: "Jordan R.", role: "Client Partnerships" },
};

interface EmailData {
  cam: string; camFull: string; tagline: string;
  firstName: string; contactFull: string; contactRole: string;
  community: string; city: string; homes: number; type: string; status: string;
  priorities: string[]; link: string; expires: string;
  camDomain: string; camEmail: string;
  senderName: string; senderRole: string;
  message?: string; // set → nudge mode: this IS the body (see renderEmail)
}

// The CAM's typed nudge message → email-safe paragraphs. Blank lines split
// paragraphs; single newlines become <br/>. Escaped first, so a message can
// never inject markup into the email.
function messageBlocks(msg: string): string {
  return msg
    .replace(/\r\n/g, "\n").trim()
    .split(/\n{2,}/)
    .map((para) =>
      `<p style="margin:0 0 14px; font-family:${FA}; font-size:15px; line-height:1.62; color:${C.body};">${
        esc(para).split("\n").join("<br/>")
      }</p>`)
    .join("");
}

function priorityCell(label: string, rightCol: boolean): string {
  return `<td class="col-stack" width="50%" valign="top" style="padding:0 ${rightCol ? "0" : "14px"} 14px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td valign="top" style="padding-right:10px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="20" height="20" style="width:20px; height:20px; background-color:${C.greenTint}; border-radius:10px; font-family:${FA}; font-size:12px; font-weight:bold; color:${C.green}; line-height:20px;">&#10003;</td></tr></table>
                      </td>
                      <td valign="middle" style="font-family:${FA}; font-size:13.5px; line-height:1.4; color:${C.ink}; font-weight:bold;">${esc(label)}</td>
                    </tr></table>
                  </td>`;
}
function priorityGrid(items: string[]): string {
  let rows = "";
  for (let i = 0; i < items.length; i += 2) {
    rows += `<tr>${priorityCell(items[i], false)}${items[i + 1] ? priorityCell(items[i + 1], true) : '<td class="col-stack" width="50%">&nbsp;</td>'}</tr>`;
  }
  return rows;
}

function renderEmail(d: EmailData): string {
  // Nudge mode — the typed message replaces the generated body, and the recap
  // blocks (stat strip, priorities grid, auto signature) drop out so a
  // follow-up reads short. Everything else (header, hero, CTA, secure note,
  // footer) is shared so it still looks like the same thread.
  const nudge = !!(d.message && d.message.trim());
  const priLine = d.priorities.length
    ? `the <strong style="color:${C.ink};">${numWord(d.priorities.length)} priorities your board raised</strong>, point by point`
    : `the specific priorities your board raised`;
  const priSection = !nudge && d.priorities.length
    ? `<tr>
            <td class="pad-sm" style="padding:18px 34px 4px 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid ${C.hairline}; padding-top:18px;">
                  <div style="font-family:${FA}; font-size:11px; font-weight:bold; letter-spacing:0.1em; text-transform:uppercase; color:${C.muted}; padding-bottom:14px;">The priorities we answered</div>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${priorityGrid(d.priorities)}
              </table>
            </td>
          </tr>`
    : "";

  const heroEyebrow = nudge ? "Following up" : "Your management proposal";
  const heroTitle = nudge ? `A quick follow-up on ${esc(d.community)}.` : `Built around ${esc(d.community)}.`;
  const heroSub = nudge ? `For ${esc(d.contactFull)} &amp; the board.` : `Prepared for ${esc(d.contactFull)} &amp; the board.`;

  // 3 stat strip — the "here's what you told us" recap. Send only.
  const statSection = nudge ? "" : `<tr>
            <td class="pad-sm" style="padding:28px 34px 6px 34px;">
              <div style="font-family:${FA}; font-size:11px; font-weight:bold; letter-spacing:0.12em; text-transform:uppercase; color:${C.green}; padding-bottom:13px;">Here's what you told us</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.hairline}; border-radius:12px;">
                <tr>
                  <td class="col-stack col-stack-b" width="33.33%" valign="top" style="padding:16px 18px; border-right:1px solid ${C.hairline};">
                    <div style="font-family:${FA}; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:${C.muted}; padding-bottom:7px;">Community</div>
                    <div style="font-family:${FA}; font-size:15px; font-weight:bold; color:${C.ink}; line-height:1.25;">${esc(d.community)}</div>
                    <div style="font-family:${FA}; font-size:12px; color:${C.muted}; padding-top:3px;">${esc(d.city || "—")}</div>
                  </td>
                  <td class="col-stack col-stack-b" width="33.33%" valign="top" style="padding:16px 18px; border-right:1px solid ${C.hairline};">
                    <div style="font-family:${FA}; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:${C.muted}; padding-bottom:7px;">Homes</div>
                    <div style="font-family:${FA}; font-size:15px; font-weight:bold; color:${C.ink}; line-height:1.25;">${esc(String(d.homes || "—"))}</div>
                    <div style="font-family:${FA}; font-size:12px; color:${C.muted}; padding-top:3px;">units under management</div>
                  </td>
                  <td class="col-stack col-stack-b-last" width="33.33%" valign="top" style="padding:16px 18px;">
                    <div style="font-family:${FA}; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:${C.muted}; padding-bottom:7px;">Type</div>
                    <div style="font-family:${FA}; font-size:15px; font-weight:bold; color:${C.ink}; line-height:1.25;">${esc(d.type || "—")}</div>
                    <div style="font-family:${FA}; font-size:12px; color:${C.muted}; padding-top:3px;">${esc(d.status || "")}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  // 4 body — nudge: the CAM's own words, verbatim (it carries its own greeting
  // and sign-off, so no auto "Hi X," above it and no signature block below).
  const bodySection = nudge
    ? `<tr>
            <td class="pad-sm" style="padding:30px 34px 0 34px;">
              ${messageBlocks(d.message!)}
            </td>
          </tr>`
    : `<tr>
            <td class="pad-sm" style="padding:24px 34px 0 34px;">
              <div style="font-family:${FA}; font-size:16px; font-weight:bold; color:${C.ink}; padding-bottom:10px;">Hi ${esc(d.firstName)},</div>
              <p style="margin:0; font-family:${FA}; font-size:15px; line-height:1.62; color:${C.body};">Thank you for telling us about ${esc(d.community)}. We didn't send a generic pitch — we built this proposal around ${priLine}.</p>
            </td>
          </tr>`;

  // 8 signature — send only; a nudge message signs itself.
  const sigSection = nudge ? "" : `<tr>
            <td class="pad-sm" style="padding:22px 34px 30px 34px;">
              <div style="font-family:${FA}; font-size:14.5px; font-weight:bold; color:${C.ink};">— ${esc(d.senderName)}</div>
              <div style="font-family:${FA}; font-size:12.5px; color:${C.muted}; padding-top:2px;">${esc(d.senderRole)} · ${esc(d.camFull)}</div>
            </td>
          </tr>`;

  const preheader = nudge
    ? `Following up on the proposal for ${esc(d.community)} — your secure link is still inside.`
    : `Built around ${esc(d.community)} — we answered the priorities your board raised. One-tap secure link inside.`;

  const ctaLabel = nudge ? "Reopen your proposal &#8594;" : "View your proposal &#8594;";

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Your management proposal · ${esc(d.cam)}</title>
<!--[if mso]>
<style type="text/css">table, td, div, p, a { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
<style type="text/css">
  body { margin: 0; padding: 0; }
  table { border-collapse: collapse; }
  img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  .cta-link:hover { background: #25805a !important; }
  @media only screen and (max-width: 560px) {
    .col-stack { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    .col-stack-b { border-right: 0 !important; border-bottom: 1px solid ${C.hairline} !important; }
    .col-stack-b-last { border-bottom: 0 !important; }
    .pad-sm { padding-left: 24px !important; padding-right: 24px !important; }
    .h1-sm { font-size: 28px !important; line-height: 1.1 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.page};">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${C.page}; opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
    <tr>
      <td align="center" style="padding:32px 16px 56px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:14px; overflow:hidden;">

          <!-- 1 header -->
          <tr>
            <td style="background-color:${C.brand}; padding:22px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="left" style="font-family:${FA}; font-size:20px; font-weight:bold; letter-spacing:0.04em; color:#ffffff;">${esc(d.cam)}</td>
                <td align="right" style="font-family:${FA}; font-size:11px; font-weight:bold; letter-spacing:0.12em; text-transform:uppercase; color:${C.tag};">${esc(d.tagline)}</td>
              </tr></table>
            </td>
          </tr>

          <!-- 2 hero (solid navy) -->
          <tr>
            <td class="pad-sm" style="background-color:${C.navy}; padding:40px 34px 38px 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding-bottom:16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td style="padding-right:10px;" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:22px; height:3px; background-color:${C.green}; font-size:0; line-height:0;">&nbsp;</td></tr></table></td>
                    <td valign="middle" style="font-family:${FA}; font-size:11px; font-weight:bold; letter-spacing:0.14em; text-transform:uppercase; color:${C.heroEy};">${heroEyebrow}</td>
                  </tr></table>
                </td></tr>
                <tr><td class="h1-sm" style="font-family:${FA}; font-size:34px; font-weight:bold; line-height:1.08; letter-spacing:-0.01em; color:#ffffff;">${heroTitle}</td></tr>
                <tr><td style="padding-top:12px; font-family:${FA}; font-size:14px; line-height:1.5; color:${C.heroSub};">${heroSub}</td></tr>
              </table>
            </td>
          </tr>

          <!-- 3 stat strip (send only) -->
          ${statSection}

          <!-- 4 body: nudge message, or the generated intro -->
          ${bodySection}

          <!-- 5 priorities -->
          ${priSection}

          <!-- 6 CTA -->
          <tr>
            <td class="pad-sm" style="padding:26px 34px 6px 34px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(d.link)}" style="height:54px;v-text-anchor:middle;width:532px;" arcsize="22%" stroke="f" fillcolor="${C.green}">
                <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${ctaLabel}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" bgcolor="${C.green}" style="background-color:${C.green}; border-radius:12px;">
                  <a class="cta-link" href="${esc(d.link)}" target="_blank" style="display:block; padding:17px 28px; font-family:${FA}; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:12px;">${ctaLabel}</a>
                </td>
              </tr></table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- 7 secure note (carries the bottom gutter when no signature follows) -->
          <tr>
            <td class="pad-sm" style="padding:18px 34px ${nudge ? "30px" : "0"} 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.tint}; border:1px solid ${C.hairline}; border-radius:12px;"><tr>
                <td valign="top" width="30" style="padding:14px 0 14px 16px; font-size:15px; line-height:1.4;">&#128274;</td>
                <td valign="top" style="padding:14px 16px 14px 9px; font-family:${FA}; font-size:12.5px; line-height:1.55; color:${C.muted};"><strong style="color:${C.body};">One-tap secure link — no password.</strong> It signs you in automatically and works only from this email.${d.expires ? ` Expires ${esc(d.expires)}.` : ""}</td>
              </tr></table>
            </td>
          </tr>

          <!-- 8 signature (send only) -->
          ${sigSection}

          <!-- 9 footer -->
          <tr>
            <td class="pad-sm" align="center" style="background-color:${C.tint}; border-top:1px solid ${C.hairline}; padding:24px 34px;">
              <div style="font-family:${FA}; font-size:13px; font-weight:bold; letter-spacing:0.02em; color:${C.body};">${esc(d.camFull)}</div>
              <div style="font-family:${FA}; font-size:12px; line-height:1.7; color:${C.muted}; padding-top:6px;">${d.camDomain ? `<a href="https://${esc(d.camDomain)}" target="_blank" style="color:${C.body}; text-decoration:none;">${esc(d.camDomain)}</a> &middot; ` : ""}${esc(d.camEmail)}<br/>Sent to ${esc(d.contactFull)}${d.contactRole ? `, ${esc(d.contactRole)}` : ""} · ${esc(d.community)}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    // A non-empty `message` switches this into nudge mode (see header note).
    // Capped so one paste can't blow past provider limits.
    const message = String(body?.message || "").trim().slice(0, 4000);
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
      .select("id, account_id, board_token, email, community, first_name, contact, contact_role, city, homes, meta_type, meta_status, link_expires, match_snapshot, owner")
      .eq("account_id", accountId).eq("lead_key", leadKey).maybeSingle();
    if (readErr) return json({ error: "read_failed", detail: readErr.message }, 500);
    if (!prop) return json({ error: "not_authorized_or_missing" }, 403);

    const recipient = (toOverride || prop.email || "").trim();
    if (!isEmail(recipient)) return json({ error: "no valid recipient email" }, 400);
    const cc = parseCc(body?.cc, recipient);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: acct } = await admin.from("accounts").select("company, short_name, proposal_from_email").eq("id", prop.account_id).maybeSingle();
    const cam = acct?.short_name || acct?.company || "Your management company";
    const camFull = acct?.company || cam;
    const fromEmail = (acct?.proposal_from_email || "").trim() || FROM_DOMAIN;
    const camDomain = (fromEmail.split("@")[1] || "").trim();
    const link = `${base}/proposals/board/${prop.board_token}`;

    // Priorities = the lead's matched concerns (persisted LLM/engine snapshot).
    // Labels only; capped to 4 so the email stays scannable. No price.
    const priorities = Array.isArray(prop.match_snapshot?.concerns)
      ? prop.match_snapshot.concerns.map((c: any) => String(c?.label || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    const rep = REP[prop.owner] || { name: `The ${cam} team`, role: "Client Partnerships" };

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
      senderName: rep.name, senderRole: rep.role,
      message,
    });

    // A nudge threads under the original in Gmail/Apple Mail via the "Re: "
    // prefix on the same subject line.
    const baseSubject = `Built around ${prop.community} — your management proposal`;
    const subject = message ? `Re: ${baseSubject}` : baseSubject;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${cam} <${fromEmail}>`,
        to: [recipient],
        ...(cc.length ? { cc } : {}),
        subject,
        html,
      }),
    });
    if (!res.ok) return json({ error: `resend ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);

    // Only NOW write to the row (don't claim sent if the email failed). Persist
    // the address we actually emailed (may be a custom recipient, not the intake
    // email) so resend/nudge and the cockpit "Sent to" line reuse it.
    //
    // A NUDGE stops there: re-stamping sent_at would slide the engagement window
    // and the link-expiry countdown the Sent stage reports, and clearing
    // board_response would erase a verdict the board already gave. A SEND/RESEND
    // does both — it's a fresh/revised proposal, so it reopens for response
    // (also how the CAM recovers an accidental decline).
    await admin.from("proposals").update(
      message
        ? { email: recipient }
        : { status: "sent", sent_at: new Date().toISOString(), email: recipient, board_response: null },
    ).eq("id", prop.id);

    return json({ sent: true, to: recipient, cc, link });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
