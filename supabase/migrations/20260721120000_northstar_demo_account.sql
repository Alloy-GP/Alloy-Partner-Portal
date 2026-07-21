-- Northstar Community Management — a prospect-safe DEMO account for the proposal
-- system. Fully isolated from real clients (its own account_id) and deliberately
-- NOT wired to anything: no whatconverts_profile_id / monday_board_id, so every
-- sync skips it. proposals_enabled=true so the cockpit/nav light up for staff.
--
-- The pipeline itself (8 fictional HOA boards + engagement events) is seeded by
-- the `reset-demo` edge function, which is the single source of truth for both
-- the initial seed and the in-app "Reset demo" button. This migration only
-- guarantees the account row exists. Idempotent.
insert into accounts (id, company, short_name, proposals_enabled, plan_published_quarters, market, tier, since)
values ('de300000-0000-4000-8000-000000000001', 'Northstar Community Management', 'Northstar',
        true, '{*}', 'Southwest Florida', 'Accelerate', 'Jan 2026')
on conflict (id) do update
  set company = excluded.company,
      short_name = excluded.short_name,
      proposals_enabled = true,
      plan_published_quarters = '{*}';
