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
  "monday_board_id", "zendesk_org_id",
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

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
