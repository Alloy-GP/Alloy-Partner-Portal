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

## SYNC_SECRET — every unattended sync endpoint fails closed
`sync-monday`, `sync-monday-roadmap`, `sync-monday-assets`, `sync-dash-assets`,
`sync-quickbooks`, `generate-snapshot`, `auto-send-snapshots`, `wc-clear-sales`,
`sync-whatconverts`, `rollup-whatconverts` are `verify_jwt: false` and require
`SYNC_SECRET`: header `x-sync-secret` (preferred) or `?secret=` (Monday webhooks
can't send headers). Unset secret = nobody gets in, never everybody.
- **Every pg_cron job that calls one MUST send the header.** Copy the value in SQL
  from a job that already has it (`substring(command from 'x-sync-secret"\s*:\s*"([^"]+)"')`),
  never paste it into a migration. Pattern: `20260909200000_cron_send_sync_secret.sql`.
- **Monday webhooks** are registered with `?secret=` in the URL (admin
  `ensureMondayWebhooks`). Monday never exposes a webhook's URL, so to replace
  stale ones POST `{"webhooks":"reconcile"}` to sync-monday (with the header);
  `{"webhooks":"list"}` is the read-only preview. Add `"target":"roadmap"` for
  the Growth Roadmap boards (-> sync-monday-roadmap).
- Function-to-function calls (admin, generate-snapshot) send the header too.
- 2026-08-17 → 09-09 outage: the secret was created for WhatConverts and armed
  every other function's dormant `if (expected && …)` gate; five cron jobs 401'd
  for 23 days. Sync Health red "Nd ago" on EVERY board = check
  `net._http_response` for 401s first, then `cron.job` commands.
- No supabase MCP available? Management API works with the MCP's access token:
  `POST /v1/projects/{ref}/functions/deploy?slug=X` (multipart: `metadata`
  `{entrypoint_path,name,verify_jwt}` + `file`), `POST …/database/query`. Pass
  the function's CURRENT `verify_jwt` (list them via `GET …/functions`) — a wrong
  flag silently breaks cron/webhooks.

## Sync watchdog — how you find out a sync failed
`sync-monitor` (cron `sync-monitor-10min`, header-gated like every sync) harvests
every cron job's pg_net result into `sync_runs`, classifies it (HTTP status,
timeout, body `ok:false` / `failed>0` / per-account `error`) and keeps open
problems in `sync_alerts`: ONE email to staff when a job starts failing or goes
silent (no run inside ≥4 intervals / ≥2h, or a Monday board not re-stamped in
2h), one reminder after 24h and then weekly while it stays broken, one on recovery. Hysteresis:
a frequent job (≤6h window) alerts only on 2 failures in a row or ≥3 in 6h
(flaky), and a recovery must hold 2h before it is emailed — a flapping job is
one incident, not one email per flip. Sync Health → "Watchdog" strip shows the
heartbeat, open alerts (with flaky ratio / hold state) and failed runs (24h).
- **New cron job? Create it WRAPPED** so its request id is recorded:
  `insert into public.cron_http_requests (job_name, request_id) select '<jobname>', t.request_id from (select net.http_post(...)) as t(request_id);`
  An unwrapped active job shows up as permanently "silent" — that's the tell.
- Recipients: `app_config.sync_alert_emails` (comma-separated) else all staff.
  POST `{"test":"email"}` (with the header) sends a test. Pure UI logic lives in
  `src/lib/syncMonitor.js` (tested). Migration: `20260909210000_sync_monitor.sql`.
- **"X is failing" then "Recovered" for `monday-daily`** = the sync itself flapped
  (2+ failures in a row, then 2h clean); the watchdog is working. Read the reason
  in `sync_runs` (`select started_at, status_code, error from sync_runs where
  source='monday-daily' and not ok order by started_at desc`) before touching
  the monitor. Known causes: 150s gateway timeout on a slow full sync, Monday
  complexity limits, PostgREST 8s statement timeout on a big write.
- **`config:` alerts = mapping problems, not failed runs.** A Monday board the
  sync can't reach because the account's id is wrong (archived, deleted, not
  found) is recorded by `sync-monday` in `monday_board_issues` (one row per
  account + board role; the next good sync of that board deletes it), reported
  in the run summary as `missing` + `warning` (NOT `error`, so the run stays
  `ok:true` and the client keeps its last rows). The watchdog emails it ONCE
  ("Needs a mapping fix", naming the client + board id), never reminds, and
  closes it quietly once the mapping changes. Sync Health shows
  "⚠ board not found / archived" on that client's row. Fix = Admin → client →
  Monday board ID (correct it, or clear it). Migration `20261007160000`.
- **Blank integration ids are NULL** — trigger `accounts_blank_ids_to_null`
  (`20261007170000`). Admin used to save `''` for an empty field, and every
  sync selects mapped accounts with `.not(col, "is", null)`, so `''` counted as
  mapped: board `""` was asked of Monday every 30 min ("board not found") and
  the weekly rollup failed ("no WhatConverts account id"), each with a daily
  reminder email (Happy CAM, 2026-10-02 → 10-07). A new consumer can rely on
  `is not null`; `.neq(col, "")` is belt and braces.
- **Live ≠ main for `admin` (since 2026-10-02).** Live `admin` is a 3-way merge
  of `origin/stg` (the onboarding feature: `onboarding_*` + `send_invite`
  actions, `obRows`/`obSeedLocations`, `onboarding_items` table — 54 commits not
  on main) and `origin/main`. v57 (2026-10-07) = that merge + the quarterly
  intake block. **Deploying `admin` from main as-is deletes onboarding.** Until
  stg lands on main, rebuild the artifact: `git merge-file -p <stg file> <merge-base file> <main file>`
  → `deno check` → deploy (zero conflicts as of 2026-10-07). Compare live vs a
  file by extracting the eszip with the npm `@deno/eszip` Parser (the MCP's own
  parser; `deno.land/x/eszip@v0.55` can't read ESZIP2.3) and esbuild-normalising
  both sides.
- **Live ≠ repo for `sync-monday-roadmap`.** The deployed v11 (2026-10-05) has
  a webhook registry (`monday_roadmap_webhooks`, migration `20261005170000`,
  applied live) whose source was never pushed to GitHub. Do NOT redeploy
  roadmap from the repo until that source lands. If it must be recovered:
  `GET /v1/projects/{ref}/functions/sync-monday-roadmap/body` is an eszip whose
  `source/index.ts` (type-stripped JS) the `deno.land/x/eszip` Parser extracts.

## Sync dependability — how the Monday sync is built to not flap
`sync-monday` (cron `monday-daily`, */30) runs every board in ONE request, so it
is engineered so no single board can sink the run:
- **Stalest board first, inside a time budget** (`RUN_BUDGET_MS` = 110s; the
  gateway drops a request silent for 150s). Boards that don't fit are returned
  as `skipped` and lead the next tick. A board that keeps missing its turn trips
  the watchdog's 2h board check.
- **Per-board try/catch**: a failing board lands in `summary` with `ok:false`,
  the rest still sync; the response is `ok:false, failed:N` (same contract as
  `sync-whatconverts`, which the watchdog classifies).
- **Atomic swap per board**: rows for all five mirror tables + the
  `monday_sync_status` stamp go through the `monday_replace_account_rows` RPC in
  one transaction (`20260919210000_monday_replace_account_rows.sql`). Old code
  did delete-then-insert per table: a failure between the two left a client's
  Projects page EMPTY until the next good tick. **Apply that migration before
  deploying the function**; without it the function warns and falls back to the
  non-atomic path (`write:"legacy"` in the summary).
- **Monday calls**: 30s timeout, 3 attempts with backoff on 429/5xx/complexity
  (queries only - never retry a mutation). `sync-monday-roadmap` shares the
  helper and the per-board isolation.
- Adding a column to `projects`/`action_items`/`ticket_links`/`toolkit_systems`:
  the RPC maps JSON keys to columns by name, so populate it in `sync-monday`'s
  row objects and it flows; no RPC change needed.

## PostgREST returns at most 1000 rows per request — whatever `.limit()` says
Supabase's PostgREST caps every response at 1000 rows (`db-max-rows`), silently.
`.limit(3000)` / `.limit(20000)` return 1000 with no error. This is how the
watchdog falsely declared `whatconverts-rollup-weekly` "silent" every Wednesday
(its last run fell out of a 1000-row window after ~3.4 days) and "recovered" a
month-end failure that nobody fixed. Need more than 1000? Query per key (the
monitor now reads runs per job), paginate with `.range(from, to)`, or aggregate
in SQL (a view / RPC). Known remaining spot: `admin` → `analytics` reads
`events` with `.limit(20000)` — it is reporting on at most 1000 rows.

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

## Client intake rounds — Newsletter and Quarterly Meeting share one shape
`newsletter_requests` (ticket tag `newsletter`) and `quarterly_requests` (tag
`quarterly`; `quarterly_meeting` / `quarterly-meeting` also match) are twins.
Staff open a round per client (Admin → Newsletter Room / Quarterly Meetings),
then put a tagged, **pending** Zendesk ticket in the client's portal — that
ticket is the to-do (Action Queue + Playbook "Waiting on you"), and it shows
"Open Form" only while the account has an `open` row. Submit = a new Zendesk
ticket with the same tag + row → `submitted` (answers in `submission` jsonb) +
a `<x>_submit` event; staff Close to archive (frees the one-live-row slot).
Seams, in order — skip one and the button silently never appears:
1. migration (`20260804120000_newsletter_requests.sql` / `20261007190000_quarterly_requests.sql`)
2. `admin` edge fn → `INTAKES` table; actions `<x>_list|open|close|delete` are one generic block
3. `src/lib/admin.js` wrappers → `AdminIntakeRounds.jsx` (shared tracker + engagement roll-up; `AdminNewsletter.jsx` / `AdminQuarterly.jsx` are copy + submission-layout wrappers) → `AdminShell` NAV/TITLES/switch/Overview card
4. `src/lib/loadData.js` → `DATA.<x>Request` (the OPEN row only; null otherwise)
5. `src/lib/<x>.js` → `<x>ForTicketTags(tags)` (pure, tested) + `submit<X>()`
6. `App.jsx` → `open<X>` trigger (null when nothing is due) + the modal (`NewsletterModal` / `QuarterlyModal`)
7. the button: `TicketThread.jsx` + the Playbook card in `screens-projects-roi.jsx`; `TicketsScreen` / `TicketDetailPage` only pass `on<X>` through
The `goals` tag is a different, older thing: no round, no DB row, email-only
(`submit-quarter-goals`, also the public `/goals` page).

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
- **Accept relay:** a doc's own Accept button may `window.parent.postMessage({ type: 'hosted-doc:accept', name, title, option, optionDetail, price, terms }, '*')`. The gate re-posts it to `hosted-doc` (`action: 'accept'`) with the proven password → `accepted` event (details in `hosted_doc_events.meta`) + Resend email to `HOSTED_DOC_ALERT_TO` (default admin@alloygp.co). Notification only — nothing is signed or billed.
- The CMA proposal is a "Bundled Page" export: content lives JSON-encoded in `<script type="__bundler/template">`; edit by parsing that string, patching, re-dumping with `</` escaped as `<\/`.
