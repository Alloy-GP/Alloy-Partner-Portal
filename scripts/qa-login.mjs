#!/usr/bin/env node
// Mints a FRESH Supabase session for browser QA, on demand, so it never
// expires mid-task. Chains the long-lived refresh token: exchange it for a new
// access token, persist the rotated refresh token, print the localStorage blob
// (base64) for injection.
//
//   node scripts/qa-login.mjs            -> prints base64 of the sb-...-auth-token value
//   node scripts/qa-login.mjs --json     -> prints the raw session JSON
//
// Bootstrap: .qa/session.json must hold a valid { refresh_token }. If the chain
// is ever broken (refresh revoked), re-seed it from a fresh browser capture.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const REF = "aryttfcmleukwstknvio";
const STORE = ".qa/session.json";

function env(k) {
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
const URL = env("VITE_SUPABASE_URL");
const ANON = env("VITE_SUPABASE_ANON_KEY");

if (!existsSync(STORE)) {
  console.error(`No ${STORE}. Seed it with { "refresh_token": "..." } from a fresh browser login.`);
  process.exit(1);
}
const prev = JSON.parse(readFileSync(STORE, "utf8"));
const refresh_token = prev.refresh_token;

const res = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token }),
});
const data = await res.json();
if (!data.access_token) {
  console.error("Refresh failed (token revoked/expired). Re-seed .qa/session.json from a fresh browser login.");
  console.error(JSON.stringify(data).slice(0, 200));
  process.exit(2);
}

// supabase-js localStorage shape
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: data.access_token,
  token_type: data.token_type || "bearer",
  expires_in: data.expires_in,
  expires_at: now + (data.expires_in || 3600),
  refresh_token: data.refresh_token,
  user: data.user,
};
// persist the ROTATED refresh token so the chain continues
writeFileSync(STORE, JSON.stringify({ refresh_token: data.refresh_token }, null, 2));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(session));
} else {
  // base64 for safe injection: localStorage.setItem(key, atob('<b64>'))
  console.log(Buffer.from(JSON.stringify(session)).toString("base64"));
}
