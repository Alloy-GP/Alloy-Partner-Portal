import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// hosted-doc — the password gate, open log, and accept notification for
// standalone HTML documents served shell-less at growth.alloygp.co/p/<slug>
// (src/components/hosted-doc.jsx).
//
// A reader has NO portal session, so RLS can't serve them — this fn does. The
// only credential is the document's shared review password (hosted_docs.password),
// compared here before anything happens. Actions (POST JSON; `action` defaults
// to "open"):
//   open   { slug, password, viewerKey }
//          → appends one `open` row to hosted_doc_events and returns the HTML.
//   accept { slug, password, viewerKey, name, title, option, optionDetail, price, terms }
//          → appends one `accepted` row (details in `meta`) and emails
//            HOSTED_DOC_ALERT_TO (default admin@alloygp.co) via Resend. The
//            document itself posts this to the gate page (window.parent) when
//            its Accept button is clicked; the gate relays it here with the
//            password it already proved. Nothing is signed or billed by this.
// A wrong password appends a `denied` row and returns 403 for either action.
// Expired documents (expires_at in the past) return 410.
//
// verify_jwt: true — the page sends the public anon key (already in the bundle)
// to clear the gateway, exactly like proposal-board; the password is the real gate.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const ALERT_TO = (Deno.env.get("HOSTED_DOC_ALERT_TO") || "admin@alloygp.co").split(/[,\s]+/).filter(Boolean);
const PORTAL_URL = (Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co").replace(/\/$/, "");
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Length-independent-ish comparison so timing doesn't leak the password prefix.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

type AcceptMeta = { name: string; title: string; option: string; optionDetail: string; price: string; terms: string };
type EventBase = { doc_id: string; viewer_key: string; user_agent: string; referrer: string; ip: string };

// Email Alloy that a reader clicked Accept. Mirrors the billing alert in
// quickbooks-payment-method (same sender, same Resend call, same look).
async function notifyAccepted(doc: { title: string }, slug: string, meta: AcceptMeta, ev: EventBase)
  : Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { sent: false, error: "RESEND_API_KEY not set" };
    const whenStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";
    const docUrl = `${PORTAL_URL}/p/${slug}`;
    const signer = [meta.name, meta.title].filter(Boolean).join(", ") || "—";
    const option = [meta.option, meta.optionDetail].filter(Boolean).join(" · ") || "—";
    const F = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
    const row = (k: string, v: string) =>
      `<tr><td class="gp-k" style="font-family:${F};font-size:12px;color:#7a6f88;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">${k}</td>` +
      `<td class="gp-v" style="font-family:${F};font-size:13.5px;color:#3f2a55;padding:6px 0;">${v}</td></tr>`;
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .gp-stage { background: #1f0e30 !important; }
      .gp-card { border-color: transparent !important; }
      .gp-dark { background: #2a1540 !important; }
      .gp-dark .gp-h, .gp-dark .gp-v { color: #f3eef9 !important; }
      .gp-dark .gp-k, .gp-dark .gp-muted { color: #b3a6c9 !important; }
      .gp-dark .gp-rule { border-color: #46325c !important; }
      .gp-dark .gp-btn { background: #d9356e !important; }
      .gp-dark .gp-link { color: #e7dcf3 !important; }
    }
  </style></head>
<body class="gp-stage" bgcolor="#381c4f" style="margin:0;padding:28px 12px;background:#381c4f;">
  <div class="gp-card gp-dark" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:26px 28px;">
    <div style="font-family:${F};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d9356e;">Proposal · accepted</div>
    <div class="gp-h" style="font-family:${F};font-size:21px;font-weight:700;color:#381c4f;margin:6px 0 14px;">${esc(signer)} accepted ${esc(doc.title || slug)}</div>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row("Option", `<strong>${esc(option)}</strong>`)}
      ${row("Price", esc(meta.price || "—"))}
      ${row("Terms", esc(meta.terms || "—"))}
      ${row("Signed by", esc(signer))}
      ${row("When", esc(whenStr))}
      ${row("Document", `<a href="${docUrl}" class="gp-link" style="color:#381c4f;">${esc(docUrl)}</a>`)}
      ${row("Device", esc((ev.user_agent || "—").slice(0, 120)))}
      ${row("IP", esc(ev.ip || "—"))}
    </table>
    <div class="gp-v" style="font-family:${F};font-size:13.5px;line-height:1.6;color:#3f2a55;margin:16px 0 18px;">
      <strong>Nothing is signed or billed by this.</strong> The reader sees “We're excited to work together · we'll be in contact shortly.” Follow up with the agreement.
    </div>
    <div class="gp-muted gp-rule" style="font-family:${F};font-size:12px;color:#8a8395;margin-top:22px;border-top:1px solid #ece8f1;padding-top:12px;">Sent by the Alloy portal when a hosted proposal's Accept button is clicked.</div>
  </div>
</body></html>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: ALERT_TO, subject: `Proposal accepted: ${doc.title || slug} — ${option}`, html }),
    });
    if (!res.ok) { const t = await res.text(); console.error("hosted-doc accept resend", res.status, t); return { sent: false, error: `resend ${res.status}: ${t.slice(0, 200)}` }; }
    const j = await res.json().catch(() => ({}));
    return { sent: true, id: j?.id };
  } catch (e) { console.error("hosted-doc accept notify", e); return { sent: false, error: String(e) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body?.action, 16).trim() || "open";
    const slug = str(body?.slug, 64).trim().toLowerCase();
    const password = str(body?.password, 256);
    if (action !== "open" && action !== "accept") return json({ error: "bad_action" }, 400);
    if (!SLUG_RE.test(slug)) return json({ error: "bad_slug" }, 400);
    if (!password) return json({ error: "password_required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: doc, error: e1 } = await admin
      .from("hosted_docs")
      .select("id, title, password, html, expires_at")
      .eq("slug", slug)
      .maybeSingle();
    if (e1) return json({ error: "lookup_failed" }, 500);
    if (!doc) return json({ error: "not_found" }, 404);

    // Who did it (anonymous): per-device key from the page + request metadata.
    const event: EventBase = {
      doc_id: doc.id,
      viewer_key: str(body?.viewerKey ?? body?.viewer_key, 64),
      user_agent: str(req.headers.get("user-agent"), 300),
      referrer: str(req.headers.get("referer"), 300),
      ip: str((req.headers.get("x-forwarded-for") || "").split(",")[0].trim(), 64),
    };

    if (!safeEqual(password, String(doc.password || ""))) {
      await admin.from("hosted_doc_events").insert({ ...event, event_type: "denied" });
      return json({ error: "wrong_password" }, 403);
    }

    if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) {
      return json({ error: "expired" }, 410);
    }

    if (action === "accept") {
      const meta: AcceptMeta = {
        name: str(body?.name, 120).trim(),
        title: str(body?.title, 120).trim(),
        option: str(body?.option, 120).trim(),
        optionDetail: str(body?.optionDetail, 200).trim(),
        price: str(body?.price, 80).trim(),
        terms: str(body?.terms, 600).trim(),
      };
      const { error: e3 } = await admin.from("hosted_doc_events").insert({ ...event, event_type: "accepted", meta });
      if (e3) console.error("hosted-doc: accepted event insert failed", e3.message); // still notify
      const alert = await notifyAccepted(doc, slug, meta, event);
      return json({ ok: true, emailed: alert.sent, to: ALERT_TO, error: alert.error });
    }

    const { error: e2 } = await admin.from("hosted_doc_events").insert({ ...event, event_type: "open" });
    if (e2) console.error("hosted-doc: open event insert failed", e2.message); // still serve the doc

    return json({ ok: true, title: doc.title || "", html: doc.html || "" });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
