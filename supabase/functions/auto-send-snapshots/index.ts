import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Friday-evening safety net: auto-publish + email the CLEAN drafts (no anomaly
// flags). Flagged drafts (e.g. "no Monday data") are LEFT as drafts for staff
// to review — auto-send never sends something suspicious. Idempotent: only
// status='draft' rows are touched, so re-running won't re-send published ones.
//
// Trigger: pg_cron (Friday eve). Optional ?secret=SYNC_SECRET.

const PORTAL_URL = "https://partner.alloygp.co";
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const SANS = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Poppins'," + SANS;
const BRAND = {
  purple: "#381c4f", deep: "#1f0e30", pink: "#d9356e", tint: "#f3f0f7",
  off: "#f8f7fc", fg: "#3f2a55", muted: "#7a6f88", teal: "#2e8b80",
  yellow: "#f5d880", green: "#aed7d0", border: "#ece8f1", lav: "#b9a9cf",
};
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const leadsStat = (snap.summary_leads || 0) + (snap.leads_value ? ` · ${snap.leads_value}` : "");
  const note = snap.note
    ? `<tr><td style="padding:20px 0 0;"><div style="background:${BRAND.tint};border-radius:12px;padding:16px 18px;"><div style="font-family:${DISPLAY};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${BRAND.purple};margin-bottom:6px;">A note from your Alloy team</div><div style="font-family:${SANS};font-size:14px;color:${BRAND.fg};line-height:1.55;">${esc(snap.note).replace(/\n/g, "<br>")}</div></div></td></tr>`
    : "";
  const bar = (c: string) => `<td height="4" style="height:4px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
  </head><body style="margin:0;background:${BRAND.off};padding:24px 16px;font-family:${SANS};">
  <table align="center" width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
    <tr><td style="background:${BRAND.deep};padding:24px 28px;">
      <div style="color:#ffffff;font-family:${DISPLAY};font-weight:800;font-size:17px;letter-spacing:.01em;">Alloy · Weekly Snapshot</div>
      <div style="color:${BRAND.lav};font-family:${SANS};font-size:12.5px;margin-top:3px;">${esc(name)} · ${esc(snap.week_label || "")}</div>
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
      <a href="${PORTAL_URL}" style="display:inline-block;background:${BRAND.purple};color:#ffffff;font-family:${DISPLAY};text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:10px;">Open your portal →</a>
    </td></tr>
    <tr><td style="background:${BRAND.off};padding:16px 28px;text-align:center;border-top:1px solid ${BRAND.border};">
      <div style="font-family:${SANS};font-size:11.5px;color:${BRAND.muted};">Sent by Alloy Growth Partners · <a href="${PORTAL_URL}" style="color:${BRAND.muted};">partner.alloygp.co</a></div>
    </td></tr>
  </table></body></html>`;
}

async function emailSnapshot(supabase: any, snap: any): Promise<number> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return 0;
  const { data: acct } = await supabase.from("accounts").select("company, short_name").eq("id", snap.account_id).maybeSingle();
  const { data: invites } = await supabase.from("account_invites").select("email, is_staff").eq("account_id", snap.account_id);
  const to = (invites || []).filter((i: any) => !i.is_staff && i.email).map((i: any) => i.email);
  if (!to.length) return 0;
  const html = renderSnapshotEmail(acct, snap);
  const subject = `Your Alloy weekly snapshot · ${snap.week_label || ""}`.trim();
  const batch = to.map((addr: string) => ({ from: FROM, to: [addr], subject, html }));
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  return res.ok ? to.length : 0;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("SYNC_SECRET");
    if (secret && url.searchParams.get("secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: drafts, error } = await supabase
      .from("weekly_snapshots").select("*, weekly_snapshot_items(*)").eq("status", "draft");
    if (error) throw error;

    const result = { sent: 0, emailed: 0, held: 0, details: [] as any[] };
    for (const snap of drafts || []) {
      const flagged = Array.isArray(snap.flags) && snap.flags.length > 0;
      if (flagged) { result.held++; result.details.push({ account: snap.account_id, held: true, flags: snap.flags.length }); continue; }
      // Publish (demote prior current), then email.
      await supabase.from("weekly_snapshots").update({ is_current: false }).eq("account_id", snap.account_id).eq("is_current", true);
      await supabase.from("weekly_snapshots").update({ status: "published", is_current: true, approved_at: new Date().toISOString() }).eq("id", snap.id);
      const n = await emailSnapshot(supabase, snap);
      if (n > 0) await supabase.from("weekly_snapshots").update({ sent_at: new Date().toISOString() }).eq("id", snap.id);
      result.sent++; result.emailed += n;
      result.details.push({ account: snap.account_id, published: true, emailed: n });
    }
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
