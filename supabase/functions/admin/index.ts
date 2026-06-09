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
      return json({ account: data });
    }

    if (action === "update_account") {
      if (!body.id) return json({ error: "id required" }, 400);
      const { data, error } = await admin
        .from("accounts").update(pick(body, ACCOUNT_FIELDS)).eq("id", body.id).select().single();
      if (error) throw error;
      return json({ account: data });
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

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
