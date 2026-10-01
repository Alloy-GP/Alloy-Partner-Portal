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

**v2 page (design handoff, Sep 30 2026):** `src/components/proposal/*` (ProposalPage,
AcceptCard, AgreementModal, TopicModal, Investment) + `src/styles/17-proposal.css`
(scoped `.pp`, Gotham from `public/fonts`, mobile stacks <960px). Evergreen copy in
`src/lib/proposalContent.js` — HARD RULES: never "Most CAM companies grow by accident";
form submissions only, never call tracking/phone. Plans (1–3, one recommended),
comparison-row toggles, ROI defaults ($14/door, 150 doors), validity (+30 days),
client legal identity, testimonial, welcome-call link: `proposalPlans.js` +
`adminEngagement.js` (`validateForSend` requires legal name/entity/address/start).
The contract text is `supabase/functions/engagement-proposal/agreementTerms.js`
(verbatim from the handoff; `buildAgreement`) and the ONE shared implementation of
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
