import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// dash-oauth-callback — one-time Dash Authorization Code Flow handshake.
//
// Dash has no client-credentials grant, so a human authorizes ONCE:
//   1. Visit the Dash authorize URL (scope must include `offline_access`),
//      redirect_uri = this function's URL.
//   2. Dash redirects back here with ?code=...  (verify_jwt MUST be false so the
//      browser redirect — which carries no Supabase JWT — can reach this).
//   3. We exchange the code at https://login.dash.app/oauth/token for an access +
//      refresh token, and store the refresh token in public.dash_oauth.
// After that, sync-dash-assets refreshes access tokens from the stored refresh
// token (which rotates on every refresh — re-stored each time).
//
// Env: DASH_CLIENT_ID, DASH_CLIENT_SECRET, plus SUPABASE_URL / SERVICE_ROLE_KEY.
// ============================================================================

const TOKEN_URL = "https://login.dash.app/oauth/token";
// The redirect_uri sent on the token exchange MUST byte-match the one registered
// in Dash AND the one used on the authorize call.
const REDIRECT_URI =
  (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "") +
  "/functions/v1/dash-oauth-callback";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err) return new Response(`Dash auth error: ${err} — ${url.searchParams.get("error_description") || ""}`, { status: 400 });
    if (!code) return new Response("missing ?code", { status: 400 });

    const clientId = (Deno.env.get("DASH_CLIENT_ID") || "").trim();
    const clientSecret = (Deno.env.get("DASH_CLIENT_SECRET") || "").trim();
    if (!clientId || !clientSecret) return new Response("DASH_CLIENT_ID / DASH_CLIENT_SECRET not set", { status: 500 });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    const tok = await res.json();
    if (!res.ok || !tok.refresh_token) {
      return new Response(`token exchange failed: ${JSON.stringify(tok)}`, { status: 502 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const expISO = tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null;
    const { error } = await supabase.from("dash_oauth").upsert({
      id: "dash",
      refresh_token: tok.refresh_token,
      access_token: tok.access_token || null,
      access_token_expires_at: expISO,
      updated_at: new Date().toISOString(),
    });
    if (error) return new Response(`store failed: ${error.message}`, { status: 500 });

    return new Response("Dash connected ✅ — you can close this tab. The asset sync can now run.", {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
