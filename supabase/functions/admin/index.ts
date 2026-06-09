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
  "monday_board_id", "zendesk_org_id", "logo_url",
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
const WEBHOOK_EVENTS = ["change_column_value", "create_item", "item_deleted"];

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

// --- Weekly snapshot email (Resend) ----------------------------------------
const PORTAL_URL = "https://partner.alloygp.co";
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Alloy brand tokens (mirror src/styles/01-base.css). Email-safe sans stacks —
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

  const section = (emoji: string, title: string, list: any[]) => {
    if (!list.length) return "";
    const rows = list.map((it) =>
      `<tr><td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${BRAND.fg};border-bottom:1px solid ${BRAND.border};">${esc(it.text)}${it.meta ? ` <span style="color:${BRAND.muted};font-size:12px;">${esc(it.meta)}</span>` : ""}</td></tr>`).join("");
    return `<tr><td style="padding:22px 0 6px;"><div style="font-family:${DISPLAY};font-weight:700;font-size:14px;color:${BRAND.purple};">${emoji}&nbsp; ${title}</div></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table></td></tr>`;
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
  </head><body style="margin:0;background:${BRAND.off};padding:24px 0;font-family:${SANS};">
  <table align="center" width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
    <tr><td style="background:${BRAND.deep};padding:24px 28px;">
      <div style="color:#ffffff;font-family:${DISPLAY};font-weight:800;font-size:17px;letter-spacing:.01em;">Alloy · Weekly Snapshot</div>
      <div style="color:${BRAND.lav};font-family:${SANS};font-size:12.5px;margin-top:3px;">${esc(name)} · ${esc(snap.week_label || "")}</div>
    </td></tr>
    <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${bar(BRAND.pink)}${bar(BRAND.yellow)}${bar(BRAND.green)}${bar(BRAND.purple)}</tr></table></td></tr>
    <tr><td style="padding:26px 28px 8px;">
      <div style="font-family:${DISPLAY};font-weight:800;font-size:22px;color:${BRAND.purple};line-height:1.3;">${esc(snap.headline || "Your week at a glance")}</div>
    </td></tr>
    <tr><td style="padding:12px 28px 4px;">
      <table width="100%" cellpadding="0" cellspacing="8" role="presentation"><tr>
        ${stat(snap.summary_completed || 0, "Shipped", BRAND.teal)}
        ${stat(leadsStat, "New leads", BRAND.purple)}
        ${stat(snap.summary_waiting || 0, "Waiting on you", BRAND.pink)}
      </tr></table>
    </td></tr>
    <tr><td style="padding:4px 28px 8px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${section("✅", "Shipped this week", g.completed)}
      ${section("🔧", "In motion", g.upcoming)}
      ${section("📥", "New leads", g.lead)}
      ${section("⏳", "Waiting on you", g.waiting)}
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

// Send the published snapshot to the account's portal client users (non-staff
// invites), one private email each. Best-effort: never blocks publishing.
async function sendSnapshotEmail(admin: any, snapshotId: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: 0, error: "RESEND_API_KEY not set" };
  const { data: snap } = await admin.from("weekly_snapshots").select("*, weekly_snapshot_items(*)").eq("id", snapshotId).maybeSingle();
  if (!snap) return { sent: 0, error: "snapshot not found" };
  const { data: acct } = await admin.from("accounts").select("company, short_name, logo_url").eq("id", snap.account_id).maybeSingle();
  const { data: invites } = await admin.from("account_invites").select("email, is_staff").eq("account_id", snap.account_id);
  const to = (invites || []).filter((i: any) => !i.is_staff && i.email).map((i: any) => i.email);
  if (!to.length) return { sent: 0, error: "no client recipients" };

  const html = renderSnapshotEmail(acct, snap);
  const subject = `Your Alloy weekly snapshot · ${snap.week_label || ""}`.trim();
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
      return json({ account: data, monday });
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
      return json({ account: data, monday });
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
        role: ["owner", "bd", "ops"].includes(body.role) ? body.role : "owner",
        is_staff: !!body.is_staff,
        name: body.name || null,
        initials: body.initials || null,
      };
      // An email belongs to one account: clear any prior invite, then insert.
      await admin.from("account_invites").delete().eq("email", email);
      const { error: invErr } = await admin.from("account_invites").insert(row);
      if (invErr) throw invErr;

      const { data: uid } = await admin.rpc("auth_uid_by_email", { p_email: email });
      let emailed = false;
      if (uid) {
        // Existing user: provision their profile (the signup trigger only
        // fires for brand-new users). They can sign in anytime.
        await admin.from("profiles").upsert({
          id: uid, account_id: row.account_id, role: row.role,
          is_staff: row.is_staff, name: row.name, initials: row.initials,
        }, { onConflict: "id" });
      } else {
        // New user: send an invite email (creates the auth user → the trigger
        // provisions their profile from the invite we just inserted).
        try {
          await admin.auth.admin.inviteUserByEmail(email, body.redirectTo ? { redirectTo: body.redirectTo } : undefined);
          emailed = true;
        } catch (_e) { /* user may self-sign-in if allowed; invite row still stands */ }
      }
      return json({ ok: true, emailed });
    }

    if (action === "remove_invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json({ error: "email required" }, 400);
      await admin.from("account_invites").delete().eq("email", email);
      // Revoke access: delete their profile if they'd signed up.
      const { data: uid } = await admin.rpc("auth_uid_by_email", { p_email: email });
      if (uid) await admin.from("profiles").delete().eq("id", uid);
      return json({ ok: true });
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
      const { data: profs } = await admin.from("profiles").select("id, name");
      const userName: Record<string, string> = {};
      for (const p of profs || []) userName[p.id] = p.name || "";
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
        const aid = e.account_id || "—";
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
        if (!e.latest) e.latest = s; // ordered desc → first seen is newest
        if (!e.draft && s.status === "draft") e.draft = s;
      }
      const rows = (accts || []).map((a: any) => {
        const e = byAcct[a.id] || { latest: null, draft: null };
        const src = e.draft || e.latest;
        const flags = ((src && src.flags) || []).slice();
        if (!e.latest) flags.push({ level: "warn", msg: "No snapshot generated yet." });
        else if (e.latest.period_end && (now - new Date(e.latest.period_end).getTime()) > 6 * 864e5) {
          flags.push({ level: "warn", msg: "No fresh snapshot this week — generation may have skipped." });
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
      // Email the client's portal users (best-effort — publish already stuck).
      const email = body.skipEmail ? { sent: 0, skipped: true } : await sendSnapshotEmail(admin, body.id);
      if (email.sent > 0) await admin.from("weekly_snapshots").update({ sent_at: new Date().toISOString() }).eq("id", body.id);
      return json({ ok: true, email });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
