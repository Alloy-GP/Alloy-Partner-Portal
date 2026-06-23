import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public sign-in sender. The login screen posts { email } here; we generate a
// one-time link + numeric code via the admin API and email BOTH through Resend
// (reliable + branded), instead of Supabase's rate-limited built-in mailer.
// The code is the bulletproof path: corporate email scanners can pre-click and
// consume a magic link (-> "link expired"), but they can't consume a code.
//
// Invite-only: we only send to emails that already have an auth user or a
// pending invite. To avoid email enumeration we always return { ok: true }
// (sent:false when the email has no access) so the UI can't be used to probe.
// verify_jwt: false (called pre-auth).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co";
const PORTAL_HOST = PORTAL_URL.replace(/^https?:\/\//, "");
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";

function renderLoginEmail(signinUrl: string, code: string): string {
  const bar = (c: string) => `<td height="4" style="height:4px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`;
  // One contiguous, selectable code (not per-digit boxes) so it copies cleanly
  // — triple-click on desktop, long-press on mobile. Letter-spacing gives the
  // boxed look without splitting the text; user-select:all selects it whole.
  const codePill = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#f3f0f7;border:1px solid #e8e4ef;border-radius:12px;padding:16px 8px 16px 26px;">
        <span style="font-family:${F};font-weight:700;font-size:34px;letter-spacing:0.26em;color:#1a0a26;-webkit-user-select:all;user-select:all;">${code}</span>
      </td></tr></table>`;
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
          <div style="font-family:${F};font-weight:500;font-size:13px;color:#b3a6c9;letter-spacing:0.04em;margin-top:3px;">Secure sign-in</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0;font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${bar("#d9356e")}${bar("#f5d880")}${bar("#a1c8e7")}${bar("#aed7d0")}${bar("#381c4f")}</tr></table>
    </td></tr>
    <tr><td style="padding:38px 40px 6px;">
      <div style="font-family:${F};font-weight:700;font-size:26px;line-height:1.15;letter-spacing:-0.01em;color:#1a0a26;margin:0 0 10px;">Sign in to your portal</div>
      <div style="font-family:${F};font-weight:400;font-size:15px;line-height:1.6;color:#555555;margin:0 0 22px;">Enter this code on the sign-in screen to finish signing in:</div>
      ${codePill}
    </td></tr>
    <tr><td style="padding:24px 40px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="#d9356e" style="border-radius:12px;background:#d9356e;box-shadow:0 8px 24px rgba(217,53,110,0.25);">
          <a href="${signinUrl}" style="display:inline-block;padding:15px 28px;font-family:${F};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px;">Open the sign-in screen &nbsp;&rarr;</a>
        </td>
      </tr></table>
      <div style="font-family:${F};font-weight:400;font-size:13px;line-height:1.5;color:#8a8395;margin-top:12px;">Opens the portal with your email filled in &mdash; just type the code above.</div>
    </td></tr>
    <tr><td style="padding:22px 40px 30px;">
      <div style="font-family:${F};font-weight:400;font-size:13px;line-height:1.6;color:#8a8395;">This code is single-use and expires in about an hour. If you didn't request this, you can safely ignore it.</div>
    </td></tr>
    <tr><td bgcolor="#f8f7fc" style="background:#f8f7fc;border-top:1px solid #e8e4ef;padding:20px 40px;text-align:center;">
      <div style="font-family:${F};font-weight:400;font-size:12.5px;color:#8a8395;">Sent by Alloy Growth Partners &middot; <a href="${PORTAL_URL}" style="color:#555555;text-decoration:none;">${PORTAL_HOST}</a></div>
    </td></tr>
  </table>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const redirectTo = String(body.redirectTo || PORTAL_URL);
    if (!email || !email.includes("@")) return json({ error: "valid email required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only send to people who already have access (auth user) or a pending
    // invite. Otherwise return ok with sent:false (no enumeration signal).
    const { data: uid } = await admin.rpc("auth_uid_by_email", { p_email: email });
    let hasInvite = false;
    if (!uid) {
      const { data: inv } = await admin.from("account_invites").select("email").eq("email", email).maybeSingle();
      hasInvite = !!inv;
    }
    if (!uid && !hasInvite) return json({ ok: true, sent: false });

    // Debounce: the OTP rotates on every generateLink, so a double-tap or quick
    // re-request would invalidate the code the user is holding. If we sent one
    // for this email in the last 30s, keep that code alive — don't regenerate.
    const { data: th } = await admin.from("login_throttle").select("sent_at").eq("email", email).maybeSingle();
    if (th && (Date.now() - new Date(th.sent_at).getTime()) < 30000) {
      return json({ ok: true, sent: true, throttled: true, otpType: uid ? "email" : "invite" });
    }

    // Existing user -> magiclink; invited-but-never-signed-in -> invite (creates
    // the auth user). generateLink returns BOTH the action_link and email_otp.
    const linkType = uid ? "magiclink" : "invite";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType as "magiclink" | "invite",
      email,
      options: { redirectTo },
    });
    // We use ONLY the code (email_otp), never the magic link: the link and code
    // share one single-use token, so a corporate email scanner pre-clicking the
    // link would burn the code too. No link in the email = nothing to consume.
    const code = linkData?.properties?.email_otp;
    if (linkErr || !code) {
      return json({ ok: false, error: `generateLink: ${linkErr?.message || "no code"}` }, 500);
    }
    // Tokenless deep link to the code-entry screen (email prefilled, no auto-send).
    const signinUrl = `${redirectTo.replace(/\/$/, "")}/?signin=${encodeURIComponent(email)}`;

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [email],
        subject: `Your Alloy Growth Portal sign-in code: ${code}`,
        html: renderLoginEmail(signinUrl, code),
      }),
    });
    if (!res.ok) return json({ ok: false, error: `resend ${res.status}: ${await res.text()}` }, 502);

    // Record the send so rapid repeats reuse this code instead of rotating it.
    await admin.from("login_throttle").upsert({ email, sent_at: new Date().toISOString() });

    // otpType tells the client which verifyOtp type to use for the typed code.
    return json({ ok: true, sent: true, otpType: uid ? "email" : "invite" });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
