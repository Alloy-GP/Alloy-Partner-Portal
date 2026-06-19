import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// set-dash-config — staff-only writer for an account's Dash mapping
// (accounts.dash_folder_id + dash_upload_url). Kept separate from the big `admin`
// function to avoid a high-blast-radius redeploy for a two-field add. verify_jwt:true.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await userClient.from("profiles").select("is_staff").eq("id", user.id).maybeSingle();
    if (!me?.is_staff) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    if (!body.id) return json({ error: "id required" }, 400);

    const patch: Record<string, unknown> = {};
    if (body.dash_folder_id !== undefined) patch.dash_folder_id = body.dash_folder_id || null;
    if (body.dash_upload_url !== undefined) patch.dash_upload_url = body.dash_upload_url || null;
    if (!Object.keys(patch).length) return json({ ok: true, account: null });

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.from("accounts").update(patch).eq("id", body.id)
      .select("id, dash_folder_id, dash_upload_url").single();
    if (error) throw error;
    return json({ ok: true, account: data });
  } catch (e: any) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
