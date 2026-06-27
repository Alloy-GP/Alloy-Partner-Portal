import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// proposal-send — email the board their magic-link proposal, and mark it sent.
//
// Flow: cockpit Send → here. We (1) AUTHORIZE by reading the proposal with the
// CALLER's session (RLS — you can only send proposals you can see), (2) build
// the magic link <baseUrl>/proposals/board/<board_token>, (3) render a
// board-facing email, (4) deliver via Resend, (5) only on success, mark the
// proposal sent (status + sent_at) with the service role. Returns {sent,to}.
//
// verify_jwt: true — a signed-in staffer/client triggers it (the session JWT
// is the auth; RLS does the per-account authorization on the read).
//
// NOTE: from-domain is alloygp.co with the CAM's display name (so the board
// sees "CMGT", not "Alloy"). True white-label (noreply@cmgt.org) needs that
// domain verified in Resend — a later step.

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

function renderEmail(cam: string, firstName: string, community: string, homes: number, link: string): string {
  const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  </head><body style="margin:0;padding:24px 12px;background:#eef0f4;font-family:${F};">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e6ec;">
    <tr><td style="background:#2b2c6c;background-image:linear-gradient(135deg,#2b2c6c 0%,#3D1A52 100%);padding:28px 40px;">
      <div style="font-family:${F};font-weight:800;font-size:20px;color:#fff;letter-spacing:-0.01em;">${esc(cam)}</div>
      <div style="font-family:${F};font-weight:500;font-size:12.5px;color:#b9b6e0;letter-spacing:0.04em;margin-top:3px;">Custom management proposal</div>
    </td></tr>
    <tr><td style="padding:38px 40px 34px;">
      <div style="font-family:${F};font-weight:700;font-size:26px;line-height:1.18;color:#16121f;margin:0 0 16px;">Your proposal for ${esc(community)} is ready.</div>
      <div style="font-family:${F};font-weight:400;font-size:15.5px;line-height:1.62;color:#555;margin:0 0 24px;">Hi ${esc(firstName)}, we didn't send a generic pitch — we built this around the specific concerns your board raised. It's an interactive page, not a PDF: click any concern to see how we'd handle it.</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr>
        <td align="center" bgcolor="#2b2c6c" style="border-radius:12px;background:#2b2c6c;">
          <a href="${esc(link)}" style="display:inline-block;padding:16px 30px;font-family:${F};font-size:16px;font-weight:700;color:#fff;text-decoration:none;border-radius:12px;">View your proposal &rarr;</a>
        </td>
      </tr></table>
      <div style="font-family:${F};font-weight:400;font-size:13px;line-height:1.6;color:#8a8a96;border-top:1px solid #ececf1;padding-top:20px;">${esc(community)} &middot; ${homes} homes. This is a private link for your board — feel free to forward it to fellow members.</div>
    </td></tr>
    <tr><td style="background:#f7f7fb;border-top:1px solid #ececf1;padding:18px 40px;text-align:center;">
      <div style="font-family:${F};font-weight:400;font-size:12px;color:#9a9aa4;">Sent by ${esc(cam)}</div>
    </td></tr>
  </table></body></html>`;
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
      .select("id, account_id, board_token, email, community, first_name, homes")
      .eq("account_id", accountId).eq("lead_key", leadKey).maybeSingle();
    if (readErr) return json({ error: "read_failed", detail: readErr.message }, 500);
    if (!prop) return json({ error: "not_authorized_or_missing" }, 403);

    const recipient = (toOverride || prop.email || "").trim();
    if (!isEmail(recipient)) return json({ error: "no valid recipient email" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: acct } = await admin.from("accounts").select("company, short_name").eq("id", prop.account_id).maybeSingle();
    const cam = acct?.short_name || acct?.company || "Your management company";
    const link = `${base}/proposals/board/${prop.board_token}`;
    const html = renderEmail(cam, prop.first_name || "there", prop.community || "your community", prop.homes || 0, link);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${cam} <${FROM_DOMAIN}>`, to: [recipient], subject: `Your management proposal for ${prop.community}`, html }),
    });
    if (!res.ok) return json({ error: `resend ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);

    // Only NOW mark it sent (don't claim sent if the email failed).
    await admin.from("proposals").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", prop.id);

    return json({ sent: true, to: recipient, link });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
