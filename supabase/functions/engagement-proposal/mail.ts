// Mail shaping for engagement-proposal — the ONE place these emails are built.
// index.ts imports from here; scripts/mail-test can import it too, so the exact
// bytes a client receives can be run through a spam scorer before shipping.
//
// Deliverability rules baked in: every send is multipart (html + real text),
// carries a monitored reply-to, comes from a verified alloygp.co address, and
// spells the destination URL out under the button.
// Override per project with PROPOSAL_FROM / PROPOSAL_REPLY_TO (no redeploy needed).
export const FROM = Deno.env.get("PROPOSAL_FROM") || "Alloy Growth Partners <noreply@alloygp.co>";
export const REPLY_TO = Deno.env.get("PROPOSAL_REPLY_TO") || "team@alloygp.co";
export const PORTAL_URL = (Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co").replace(/\/$/, "");
export const ALERT_TO = (Deno.env.get("PROPOSAL_ALERT_TO") || Deno.env.get("BILLING_ALERT_TO") || "admin@alloygp.co")
  .split(/[,\s]+/).filter(Boolean);
const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
export const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 ? 2 : 0 }) : "—";
};
export const whenET = (d = new Date()) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";

// One branded shell for every email this function sends.
export type Mail = { kicker: string; title: string; rows?: [string, string][]; body?: string; ctaUrl?: string; ctaLabel?: string; footer: string };
// Plain-text twin of shell(): same content, no markup. Spam filters penalize
// HTML-only mail (no text/plain part), and some clients prefer the text part.
const strip = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;|&#183;/g, "·").replace(/[ \t]+\n/g, "\n").trim();
export function text(opts: Mail): string {
  const lines: string[] = [opts.title, ""];
  for (const [k, v] of opts.rows || []) lines.push(`${k}: ${strip(v)}`);
  if (opts.rows && opts.rows.length) lines.push("");
  if (opts.body) lines.push(strip(opts.body), "");
  if (opts.ctaUrl) lines.push(`${opts.ctaLabel || "Open"}: ${opts.ctaUrl}`, "");
  lines.push("--", opts.footer, "Alloy Growth Partners · alloygp.co");
  return lines.join("\n");
}
export function shell(opts: Mail) {
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
    ${opts.ctaUrl ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:#381c4f;color:#ffffff;font-family:${F};font-weight:700;font-size:13.5px;text-decoration:none;padding:12px 20px;border-radius:999px;">${esc(opts.ctaLabel || "Open")}</a>
    <div style="font-family:${F};font-size:12px;color:#8a8395;margin-top:10px;">Or open <a href="${opts.ctaUrl}" style="color:#381c4f;">${esc(opts.ctaUrl.replace(/^https?:\/\//, ""))}</a></div>` : ""}
    <div style="font-family:${F};font-size:12px;color:#8a8395;margin-top:22px;border-top:1px solid #ece8f1;padding-top:12px;">${esc(opts.footer)}</div>
  </div>
</div>`;
}

export async function sendEmail(to: string[], subject: string, mail: Mail, replyTo?: string): Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { sent: false, error: "RESEND_API_KEY not set" };
    if (!to.length) return { sent: false, error: "no recipients" };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html: shell(mail), text: text(mail), reply_to: replyTo || REPLY_TO }),
    });
    if (!res.ok) { const t = await res.text(); console.error("resend", res.status, t); return { sent: false, error: `resend ${res.status}: ${t.slice(0, 200)}` }; }
    const j = await res.json().catch(() => ({}));
    return { sent: true, id: j?.id };
  } catch (e) { console.error("email", e); return { sent: false, error: String(e) }; }
}
