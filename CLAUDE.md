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
- `accounts.whatconverts_profile_id` holds a WhatConverts **account_id** (not profile_id). Leads API: `GET /leads?account_id=...&order=DESC` (DESC sorts by date). Single-query window cap is **400 days**; per-page max 2000.
- Live sync window = **calendar YTD**; prior-year qualified totals come from the weekly `rollup-whatconverts` (stored on `accounts.wc_*`).
- `quotable` ("yes"/"no"/"pending"/"not_set") is the qualification signal: yes→qualified, no→not-a-fit, else→needs-review.
- **Money is MONTHLY** end-to-end (WhatConverts + client input). Store raw monthly in `quote_value`/`sales_value`; annualize (×12) only for display.
- `customer_journey=true` returns the real multi-touch path (Elite plan; this account has it) → stored in `leads.journey`.
- Qualify write-back: `qualify-lead` edge function POSTs to WhatConverts `/leads/{id}`; account-scoped (clients own account only, staff any).

## Edge function deploy
Write the `.ts`, then deploy via supabase MCP `deploy_edge_function` (files
array, inline content). `sync-whatconverts`/`rollup-whatconverts` are
`verify_jwt: false`; `qualify-lead`/`zendesk`/`admin` are `verify_jwt: true`.

## Editing screens-rest.jsx
Lines contain non-ASCII (·, —, …, ✓). The Edit tool's exact-match can fail on
these. For large/awkward edits, splice with a Python script (reads/writes UTF-8)
using ASCII anchors instead of fighting the matcher.
