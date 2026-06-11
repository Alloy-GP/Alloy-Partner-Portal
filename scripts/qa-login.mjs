#!/usr/bin/env node
// Mint a FRESH Supabase session for browser QA, on demand. Uses the service-role
// admin API to generate a one-time magic link for the staff QA user and redeem
// it — so there's NO token to expire (a brand-new session every run). Prints the
// base64 of the localStorage auth blob for injection (or --json for raw).
//
//   node scripts/qa-login.mjs           -> base64 of the sb-<ref>-auth-token value
//   node scripts/qa-login.mjs --json    -> raw session JSON
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. QA_EMAIL overrides the user.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(k) {
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
const URL = env("VITE_SUPABASE_URL");
const ANON = env("VITE_SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const EMAIL = process.env.QA_EMAIL || "skyler@alloygp.co";

if (!SERVICE || SERVICE.includes("PASTE")) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set in .env.local — see qa-login header.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);

// Generate (don't email) a magic link for the QA user, then redeem the token
// for a real session.
const gen = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (gen.error || !gen.data?.properties?.hashed_token) {
  console.error("generateLink failed:", gen.error?.message || "no hashed_token");
  process.exit(2);
}
const token_hash = gen.data.properties.hashed_token;

const anon = createClient(URL, ANON, opts);
let v = await anon.auth.verifyOtp({ token_hash, type: "magiclink" });
if (v.error) v = await anon.auth.verifyOtp({ token_hash, type: "email" });
if (v.error || !v.data?.session) {
  console.error("verifyOtp failed:", v.error?.message || "no session");
  process.exit(3);
}

const s = v.data.session;
const blob = {
  access_token: s.access_token,
  token_type: s.token_type || "bearer",
  expires_in: s.expires_in,
  expires_at: s.expires_at,
  refresh_token: s.refresh_token,
  user: s.user,
};
console.log(process.argv.includes("--json")
  ? JSON.stringify(blob)
  : Buffer.from(JSON.stringify(blob)).toString("base64"));
