import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// submit-quarter-goals — the PUBLIC pre-planning intake. The anonymous form at
// /goals posts { company, contactName, email, quarter, goals, challenges } here
// and we email the Alloy team a branded summary via Resend. No portal session,
// no DB write — this is a notify-only endpoint (same anon-key-clears-the-gateway
// model as the other public functions).
//
// Abuse control: this URL is public, so we (1) drop bot submissions via a
// hidden honeypot field, (2) hard-cap every field length, and (3) require the
// essentials (company + goals + a valid email). We always answer {ok:true} to a
// honeypot hit so a bot can't tell it was filtered.
//
// verify_jwt: true (the bundled anon key clears the Supabase gateway; there is
// no per-user auth on a public intake form).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
// Where the intake lands — the INTERNAL team inbox. NOTE: this is deliberately
// NOT team@alloygp.co (that's the public "email us directly" address in the
// portal links/footers); form submissions notify the internal inbox instead.
const NOTIFY = ["admin@alloygp.co"];
const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";

function renderEmail(f: {
  company: string; contactName: string; email: string;
  quarter: string; goals: string; challenges: string;
}): string {
  const bar = (c: string) => `<td height="4" style="height:4px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`;
  const row = (label: string, value: string) => `
    <tr><td style="padding:18px 40px 0;">
      <div style="font-family:${F};font-weight:700;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8a8395;margin:0 0 5px;">${esc(label)}</div>
      <div style="font-family:${F};font-weight:400;font-size:15px;line-height:1.6;color:#1a0a26;">${value}</div>
    </td></tr>`;
  const contact = f.email
    ? `${esc(f.contactName || "—")} &middot; <a href="mailto:${esc(f.email)}" style="color:#d9356e;text-decoration:none;">${esc(f.email)}</a>`
    : esc(f.contactName || "—");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
  </head><body style="margin:0;padding:24px 12px;background:#ebe8f1;font-family:${F};">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e4ef;box-shadow:0 6px 18px rgba(56,28,79,0.10);">
    <tr><td bgcolor="#381c4f" style="background:#290d41;background-image:linear-gradient(135deg,#381c4f 0%,#290d41 100%);padding:30px 40px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;background:#ffffff;border-radius:12px;">
          <img src="https://growth.alloygp.co/alloy-icon.png" width="30" height="30" alt="Alloy" style="display:block;width:30px;height:30px;border:0;"/>
        </td>
        <td style="padding-left:14px;">
          <div style="font-family:${F};font-weight:700;font-size:19px;color:#ffffff;letter-spacing:-0.01em;">Alloy &middot; Pre-Planning Intake</div>
          <div style="font-family:${F};font-weight:500;font-size:13px;color:#b3a6c9;letter-spacing:0.04em;margin-top:3px;">New quarter goals submitted</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0;font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${bar("#d9356e")}${bar("#f5d880")}${bar("#a1c8e7")}${bar("#aed7d0")}${bar("#381c4f")}</tr></table>
    </td></tr>
    <tr><td style="padding:34px 40px 2px;">
      <div style="font-family:${F};font-weight:700;font-size:24px;line-height:1.15;letter-spacing:-0.01em;color:#1a0a26;margin:0;">${esc(f.company)}</div>
      <div style="font-family:${F};font-weight:600;font-size:14px;color:#d9356e;margin-top:6px;">Planning for ${esc(f.quarter)}</div>
    </td></tr>
    ${row("Submitted by", contact)}
    ${row("Top goals / objectives", nl2br(f.goals))}
    ${f.challenges ? row("Challenges / what's blocking them", nl2br(f.challenges)) : ""}
    <tr><td style="padding:26px 40px 30px;">
      <div style="font-family:${F};font-weight:400;font-size:12.5px;line-height:1.5;color:#8a8395;border-top:1px solid #e8e4ef;padding-top:16px;">Sent from the public pre-planning form at growth.alloygp.co/goals${f.email ? " &middot; reply to this email to reach them directly." : "."}</div>
    </td></tr>
  </table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: a real person never fills a hidden field. Silently accept and
    // drop so a bot gets no signal that it was filtered.
    if (str(body?.website, 200) || str(body?.company_url, 200)) return json({ ok: true });

    const company = str(body?.company, 200);
    const contactName = str(body?.contactName ?? body?.contact_name, 120);
    const email = str(body?.email, 200).toLowerCase();
    const quarter = str(body?.quarter, 40) || "next quarter";
    const goals = str(body?.goals, 6000);
    const challenges = str(body?.challenges, 6000);

    if (!company) return json({ error: "Company name is required." }, 400);
    if (!contactName) return json({ error: "Your name is required." }, 400);
    if (!email || !isEmail(email)) return json({ error: "A valid email is required." }, 400);
    if (!goals) return json({ error: "Please share at least one goal." }, 400);
    if (!challenges) return json({ error: "Please share your challenges." }, 400);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY not set" }, 500);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: NOTIFY,
        reply_to: email,
        subject: `New quarter goals: ${company} (${quarter})`,
        html: renderEmail({ company, contactName, email, quarter, goals, challenges }),
      }),
    });
    if (!res.ok) return json({ error: `resend ${res.status}: ${await res.text()}` }, 502);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
