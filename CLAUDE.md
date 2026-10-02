# Alloy Partner Portal — working notes

Client-facing portal. Vite 6 + React 18 SPA, React Router 7 (URL-derived
screens). Supabase (Postgres + RLS, Auth magic-link, Edge Functions/Deno,
pg_cron). Deployed on Vercel: **production tracks `main`**, feature branches get
preview deploys. Project ref: `aryttfcmleukwstknvio`.

## Verify before you say "done"
A passing `npm run build` proves the code **compiles**, not that data **flows**
or the UI **renders**. Do not call work done off a build alone. Either dogfood
the running screen, or explicitly say "compiles, not yet rendered." Most bugs
this codebase has hit were runtime/data-flow issues a build never catches.

## Tests — run the gate, add to it
`npm run check` = `build` + `test` (Vitest) + `check:edge` (`deno check` on every
edge function). **Run it before calling anything done and before any deploy.**
- **`npm run test`** — Vitest over `src/**/*.test.js`. The pure logic that decides
  what the UI shows (`quarterStats`, `engines`, `perms`, …) is unit-tested; a
  wrong-number regression there fails here, not in production. When you change or
  add pure logic in `src/lib`, add/extend a `*.test.js` beside it.
- **`npm run check:edge`** — type-checks all `supabase/functions/*/index.ts` with
  Deno (their real runtime). This catches the exact class that took invites down
  (an out-of-scope reference compiles in a vacuum but throws at runtime →
  `TS2304 Cannot find name`). Needs Deno (`brew install deno`); config lives in
  `supabase/functions/deno.json`.

## Adding a field to a lead (or any synced entity) — thread ALL seams
The #1 recurring bug is adding a field at the source + the consumer but skipping
a middle layer, so it silently arrives `undefined`. For a **lead field**, touch
every seam:
1. **Migration** — `alter table leads add column ...` (apply via supabase MCP `apply_migration`, AND write the matching file in `supabase/migrations/`).
2. **`supabase/functions/sync-whatconverts/index.ts`** — populate it in `mapLead`.
3. **`src/lib/loadData.js`** — add it to the `recentLeads` map. ← most-missed
4. **`src/components/screens-rest.jsx` → `buildLeadsPage`** — add it to the `list` view-model map. ← also missed
5. **The component** that renders it.
After: redeploy the edge function, re-run the sync, and confirm with a DB query
that the column populated. Grep the field name across all 5 files before done.

## WhatConverts data model (leads)
- `accounts.whatconverts_profile_id` holds one or MORE WhatConverts **account_ids** (not profile_ids), comma/space-separated (CMGT has three). **Every consumer must split it** (`parseAccountIds` in the edge functions, `parseProfileIds` in `src/lib/wcProfiles.js`) and query each id — passing the raw string gets `410 Invalid account_id parameter, please use a numeric value` (how `rollup-whatconverts` failed for CMGT every Monday from Jul→Sep 2026). Leads API: `GET /leads?account_id=...&order=DESC` (DESC sorts by date). Single-query window cap is **400 days**; per-page max 2000.
- Live sync window = **calendar YTD**; prior-year qualified totals come from the weekly `rollup-whatconverts` (stored on `accounts.wc_*`).
- `quotable` ("yes"/"no"/"pending"/"not_set") is the qualification signal: yes→qualified, no→not-a-fit, else→needs-review.
- **Money is MONTHLY** end-to-end (WhatConverts + client input). Store raw monthly in `quote_value`/`sales_value`; annualize (×12) only for display.
- `customer_journey=true` returns the real multi-touch path (Elite plan; this account has it) → stored in `leads.journey`.
- Qualify write-back: `qualify-lead` edge function POSTs to WhatConverts `/leads/{id}`; account-scoped (clients own account only, staff any).

## Edge function deploy
Write the `.ts`, **run `npm run check:edge` (must pass)**, THEN deploy via
supabase MCP `deploy_edge_function`. Deploy the file VERBATIM from disk — do NOT
hand-retype/re-emit it (a re-emit is how the `bar is not defined` 500 shipped:
the deployed copy drifted from the type-checked on-disk source). After deploy,
`get_edge_function` can confirm live == repo. `sync-whatconverts`/
`rollup-whatconverts` are `verify_jwt: false`; `qualify-lead`/`zendesk`/`admin`
are `verify_jwt: true`.

## Editing screens-rest.jsx
Lines contain non-ASCII (·, —, …, ✓). The Edit tool's exact-match can fail on
these. For large/awkward edits, splice with a Python script (reads/writes UTF-8)
using ASCII anchors instead of fighting the matcher.

## Supabase access — MCP first, Management API fallback
The `supabase` MCP server is declared in `.mcp.json` (project scope, auto-approved
via `.claude/settings.json`). It needs `SUPABASE_ACCESS_TOKEN` in the environment;
Conductor injects it from the gitignored `.conductor/settings.local.toml` on the
Mac that creates the workspace. If the MCP tools are missing in a session, do not
stop — use the same token against the Management API (it is what the MCP wraps):
```
SQL:      curl -s -X POST https://api.supabase.com/v1/projects/aryttfcmleukwstknvio/database/query \
            -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
            -d '{"query":"select 1"}'
Functions: GET  https://api.supabase.com/v1/projects/aryttfcmleukwstknvio/functions
```
The Supabase CLI also reads the token from `SUPABASE_ACCESS_TOKEN` (`supabase functions deploy <name> --project-ref aryttfcmleukwstknvio`).
Token missing entirely? Ask the user for it once, then persist it in that settings.local.toml.

## Autopay onboarding nudge (bank on file)
Soft nudge for billing-role clients with no row in `quickbooks_payment_methods`:
modal at sign-in ("Remind me later" = session snooze) + persistent banner on every
screen + Account-page empty state, until a bank is attached. Decision is pure —
`shouldNudgePayment` in `src/lib/paymentNudge.js` (tested). Admin can exempt an
account via `accounts.autopay_required=false`. Seams: migration → `admin` fn
`ACCOUNT_FIELDS` → `AdminScreen` toggle → `loadData` (`account.autopayRequired`) →
`App.jsx`. Capture is PCI-safe: browser → Intuit tokens endpoint (unauthenticated
by design; host comes from the function's `config` action) → `attach`. Intuit
gotcha: `createFromToken` wants `{ value: token }`, not `{ token }` (PMT-4002).
Alloy still creates the recurring draft — Admin → client → Autopay (`AdminAutopay.jsx` →
staff-only `createRecurring`/`deleteRecurring`). A successful `attach` emails
`BILLING_ALERT_TO` (default admin@alloygp.co) via Resend; staff can `resendBankAlert`.

## Hosted docs (`/p/<slug>`) — password-gated standalone HTML
One-off documents that don't fit the portal (e.g. a custom proposal built
elsewhere as a single HTML file) are hosted at `growth.alloygp.co/p/<slug>`
behind a shared password, with opens logged. **The repo is public — never commit
the HTML under `public/`**; it lives in `hosted_docs.html` (like `guides.html`).
Seams: `supabase/migrations/20261002120000_hosted_docs.sql` (`hosted_docs`,
`hosted_doc_events`, staff-readable `hosted_doc_opens` view) → `hosted-doc` edge
fn (`verify_jwt: true`, anon key clears the gateway; checks the password,
appends one `open`/`denied` event, returns the HTML) → `src/lib/hostedDoc.js`
(pure, tested) → `src/components/hosted-doc.jsx` (gate → full-viewport
`<iframe srcdoc>`) → `AuthGate.jsx` public route.
- Create/replace a doc: `SUPABASE_ACCESS_TOKEN=… node scripts/hosted-doc-upload.mjs --slug <slug> --file <doc.html> [--title …] [--password …] [--expires YYYY-MM-DD]`.
- See opens: `node scripts/hosted-doc-upload.mjs --opens` or `select * from hosted_doc_opens` (Table Editor works too).
- Change a password: `update hosted_docs set password='…' where slug='…'`.
