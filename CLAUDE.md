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
- **`admin` live == main again (2026-10-07).** stg (onboarding, proposal gate,
  client workspace) was promoted to main in PR #74, so deploy `admin` from the
  repo as usual. If live and repo ever need comparing: extract the eszip with
  the npm `@deno/eszip` Parser (the MCP's own parser; `deno.land/x/eszip@v0.55`
  can't read ESZIP2.3) and esbuild-normalise both sides.
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
- **The prompt ticket is sent from the portal.** "Open a round" also creates
  the client's Zendesk ticket (pending, tagged) — `admin` → `intake_prep` lists
  the agents to send as (default Sharlene) and each org's users to send to
  (default: the portal owner); `<x>_open` takes `ticket: { send, senderId,
  subject, message, recipients }`, fills `{name} {client} {title} {sender}`
  (`src/lib/intakeTicket.js` mirrors it for the preview, tested) and records
  `prompt_ticket_id` / `prompt_meta` on the row (migration `20261007200000`).
  Submitter + first-comment author + assignee = the picked agent, so the client
  sees it from her. `cc` (per-client contact ids) + `ccEmails` (every ticket)
  become `email_ccs`. A failed send keeps the round open and names the client
  in the response; make that ticket by hand.
- **Scheduling the meeting (Cal.com).** Lifecycle of a quarterly round: open →
  "Open Form" · submitted → "Schedule the meeting" · booked → "Meeting booked ·
  <date>" · closed → nothing. Booking is detected from Cal's embed events
  (`bookingSuccessful[V2]` via `onCalEvent`) → `recordQuarterlyBooking` writes
  `meeting_at/uid/meta` (migration `20261008120000`, client's own row under RLS),
  flips `DATA.quarterlyRequest`, dispatches `quarterly:changed` so the button
  retires without a reload, and tracks `quarterly_booked`. Only bookings made
  INSIDE the portal dialog are seen; a Cal.com webhook would also catch
  cancels/reschedules/outside bookings (not built). The
  success step of `QuarterlyModal` and `QuarterlyBookButton` (ticket thread +
  Playbook card, self-contained, no App prop) open Cal's dialog via
  `src/lib/calEmbed.js` (lazy `embed.js`, programmatic `modal`) prefilled with
  name/email (`quarterlyBookingConfig`, tested). `loadData` therefore loads the
  live round (`status <> 'closed'`), not just the open one. Event type =
  `CAL_QUARTERLY` in `src/lib/quarterly.js`; click → `quarterly_schedule_click`.
- **Test it on Alloy, not a client.** The internal account (Alloy Growth
  Partners, tier `internal`) is mapped to the Alloy Zendesk org, so a round
  opened for it goes to Alloy people only; `zendesk_orgs` (admin fn) lists
  every org id for mapping. Delete the test round + ticket afterwards.
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

## Engagement proposal gate (Alloy's proposal to a NEW client)
Not the CMGT board system (`proposals`). Table `engagement_proposals`: staff author
in Admin → client → Engagement proposal (`AdminEngagement.jsx`, writes under RLS)
from the evergreen catalog `src/lib/engagementCatalog.js` (modules + how each
scales with `locations_count`). **Send → the client's portal is LOCKED to
`ProposalGate.jsx` until their OWNER accepts** (`acceptProposal` cap = client:owner).
Decision is pure — `proposalGateState` in `src/lib/engagementGate.js` (tested):
staff never locked, "View as client" locked (that is the QA path; Accept disabled
in preview). Client writes (accept / request_changes) + staff `notify_sent` go
through the `engagement-proposal` edge fn (`verify_jwt: true`; emails
`PROPOSAL_ALERT_TO`, default admin@alloygp.co). Seams: migration → `loadData`
(`DATA.engagement`, error-tolerant) → `App.jsx` (gate before `titles`; mutes the
autopay nudge + tour while locked; staff banner when 'sent') → `AuthGate` realtime
channel (`engagement_proposals`) so send/withdraw locks/unlocks live. Withdraw
unlocks and allows a new proposal; re-send bumps `version`; acceptance records
who/when/`accepted_version`/`agreement_version` (bump `PROPOSAL_AGREEMENT_VERSION`
when the wording changes). Reference docs = `reference_links` (view.alloygp.co).

**v3 page (design handoffs Sep 30 + Oct 1 2026):** `src/components/proposal/*`
(ProposalPage, AcceptCard, AgreementModal, SampleModal, Investment) +
`src/styles/17-proposal.css` (scoped `.pp`, Gotham from `public/fonts`, mobile
stacks <960px). Four sections: 01 What you're buying (fixed 2×/6×+/1× results
block; "The floor" grays out when the selected plan has no guarantee) · 02 What
to expect (capability chips, Reach/Match/Retain program cards, 35+ years band +
expertise tiles, match HOA partner card) · 03 Investment (plan cells with a
"Fuel" bar, match HOA logo row, Your terms, due-at-start band, seal) · 04 Next
steps ("Review terms and sign"). No in-page chat since Oct 2 2026: questions go
to the rep's contact on the cover; the Admin rail's Thread card shows historical
client questions only (staff replies still email the owners). **One-off HTML:**
`npm run proposal:standalone [data.json]` (tools/standalone-proposal) bundles the real
page + CSS + Gotham + images into one file with a hand-editable JSON data block;
`ProposalPage standalone` hides sign-out and routes acceptance to the portal. Section toggles = `SECTION_DEFS` keys
results/baseline/programs/expertise/partner/next. Evergreen copy in
`src/lib/proposalContent.js` — HARD RULES: never "Most CAM companies grow by
accident"; form submissions only, never call tracking as a service; NO em dashes
in page copy. The cover shows the rep's contact (`prepared_by_phone/email`) and
the Next-steps headline is per-proposal (`next_steps_title`, default seasonal).
Removed in v3: the module picker / outcome cards, the ROI calculator, Admin
intro/closing (columns kept, unused). Plans (1–3, one recommended; templates
Steady/Accelerate/Ascend with `matchHoa`, `portal`, `fuel`), comparison-row
toggles, validity (+30 days), client legal identity, testimonial (links to
Vimeo), welcome-call link: `proposalPlans.js` + `adminEngagement.js`
(`validateForSend` requires legal name/entity/address/start).
The contract text is `supabase/functions/engagement-proposal/agreementTerms.js`
(verbatim from the handoff; `buildAgreement`; party = **Alloy Growth Partners, LLC**
since Oct 2 2026 → `PROPOSAL_AGREEMENT_VERSION` 'v2'; Sec. 3.2 radius =
`exclusivity_miles`) and the ONE shared implementation of
plans + the agreement document is `proposalShared.js` in the same folder — the portal
imports it by relative path, so the modal and the server snapshot render the same
bytes. Accept requires `agreementRead` + `planKey`; the fn stores `accepted_plan_key`,
IP, user agent, `agreement_snapshot` (facts + full text) and `agreement_hash`
(sha-256) — the signed record until a PDF service exists. Headless Chrome in the
cloud sandbox stalls on this page (Gotham shaping + scroll containers), as it did
on the designer's prototype: verify visually in a real browser on stg.

## Admin · Manage Clients workspace (design handoff, Sep 30 2026)
`src/components/admin/ClientWorkspace.jsx` replaces the old one-page AdminScreen:
sticky header (identity · tab strip · Save / status pill) + clients list + tabs
`ClientTabs.jsx` (Profile, Locations, Integrations, Team & access) and
`ProposalWorkspace.jsx` (sub-tabs Overview/Plan · Plans & pricing · Content ·
Agreement, plus the right rail: Preview/Send, "Client will see" + send checklist,
Activity, Thread, Back to draft/Withdraw). Styles `18-admin.css` (scoped `.adm`).
- Clients list is sectioned by `groupClients` (tested): In proposal (draft/sent) ·
  Active clients (accepted or no proposal) · Internal. The **Alloy** account is
  `tier='internal'` — staff profiles live on it; it is NOT a client, and every
  other admin screen filters that tier out of client lists.
- Locations are `accounts.locations` jsonb `[{name, hq, address, status, tag}]`
  (tag: active | onboarding | proposed) — they feed the proposal's market chips.
- Proposal v2 columns: `markets text[]` (which locations this proposal covers),
  `sections jsonb` (page section toggles s1–s6; the page hides them), `spoc`,
  `valid_days` (send stamps valid_through = today + days), plans carry `show`.
- Team roles: client owner | staff ("Viewer" in the UI) | accounting; only the
  owner accepts. `list_invites` (admin fn) adds `signed_up` + `last_seen_at`
  from events. Invites can be added quietly (`send_email:false`) and sent later.
- Send is gated by `sendChecklist` (markets, recommended plan, legal name,
  entity+address, start date are hard; "an owner invited" is a warning).
- Activity = `events` rows `proposal_*` for the account (staff read policy) via
  `loadProposalActivity`; names from the account's profiles.
- Plan (accepted) view: purple summary, Included / Markets / Signed cards, and a
  Billing row whose "Change plan" / "Pause · cancel" are DISABLED placeholders.

## Onboarding checklist (replaces the emailed intake Google Sheet)
Per-client intake: contacts, platform access/credentials, brand files, existing
marketing tools. Template = `TEMPLATE` in `src/lib/onboarding.js` (pure, tested).
Add a line item there with a NEW stable `key` (never rename one — the client's
answers hang on it); existing clients pick it up via Admin → Onboarding → "+ N new".
Seams: migration (`onboarding_items` + `accounts.onboarding_started_at/completed_at`)
→ `admin` fn `onboarding_*` actions (overview/start/reset/complete/remove — the UI
sends the materialized rows, the fn stamps `account_id`) → `src/lib/admin.js` →
`AdminOnboarding.jsx` (+ "Start their onboarding checklist" checkbox on New client
in `admin/ClientWorkspace.jsx` → `ProfileTab`, default on) → `loadData` (`DATA.onboarding`,
`account.onboardingStartedAt`) → `OnboardingScreen.jsx` at `/onboarding` (clients
write rows directly under RLS via `src/lib/onboardingData.js`, autosave) → nav
entry + badge (`shell.jsx`) + dashboard Action Queue card (`screen-dashboard.jsx`).
`alloy_status` (the sheet's "Alloy Confirm") is staff-only — a DB trigger rejects it
from a client JWT. Perms cap `screen_onboarding` (accounting excluded: credentials).
Visibility is one helper, `canSeeOnboarding`, used by both the route and the nav.
The autopay bank step is a checklist row too (section `billing`, kind `payment`):
no typed fields — the row's button opens `PaymentSetupModal`; its status is DERIVED
(`derivePaymentStatus` in `loadData` + the same join in `onboarding_overview`): bank
in `quickbooks_payment_methods` → complete, `autopay_required=false` → n/a. While a
checklist is open, `App.jsx` mutes the sign-in modal + banner (`pmNudgeUi`).
Locations (section `locations`, kind `location`: label = name, fields {address, phone,
manager, hours, notes})
SYNC INTO `accounts.locations` via the DB trigger `onboarding_items_locations_sync`
(`onboarding_sync_locations`, migration 20261001180000): linked by `source_key`/name,
staff hq/status/tag preserved, client-added entries carry `source='onboarding'` and
are removed when the row is; staff entries only unlink. `onboarding_start`/`reset`
seed one row per existing staff location (`obSeedLocations`). Staff read everything
the client entered in Admin → Manage Clients → **Credentials** tab
(`admin/CredentialsTab.jsx`, read-only; edits happen in the client's checklist).
