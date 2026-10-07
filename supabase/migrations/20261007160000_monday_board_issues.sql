-- Monday board ISSUES: a mapping problem is not a sync failure.
--
-- Why: from 2026-10-04 the watchdog emailed staff every day that
-- "monday-daily is failing - <account uuid>: board not found". One account's
-- monday_board_id pointed at a board Monday no longer returns (archived or
-- deleted). sync-monday reported that board as a per-account `error`, the
-- watchdog classified the whole run as failed, and because the board was never
-- going to come back on its own, the alert stayed open and reminded daily. The
-- email named a uuid, not a client, and said nothing about what to do.
--
-- A board that cannot be synced because its MAPPING is wrong (archived,
-- deleted, not found, no access) is a configuration problem for staff to fix
-- in Admin, so it is recorded HERE, one row per (account, board role), and:
--   - sync-monday / sync-monday-roadmap upsert the row (and keep the client's
--     last good data), delete it on the next successful sync, and report the
--     board as `missing` in the run summary - the run itself still succeeds;
--   - sync-monitor raises a `config:` alert for an open row: ONE email naming the
--     client, the board and the fix; no daily reminder; closes silently;
--   - Sync Health shows "⚠ board archived" (etc.) on the client's row via the
--     two columns appended to account_sync_health.
create table if not exists public.monday_board_issues (
  account_id uuid not null references public.accounts(id) on delete cascade,
  board_role text not null check (board_role in ('main', 'roadmap')),
  board_id   text not null,                 -- the id that failed, as mapped on the account
  issue      text not null,                 -- 'board not found' | 'board archived' | 'board deleted'
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (account_id, board_role)
);
alter table public.monday_board_issues enable row level security;
drop policy if exists "staff read" on public.monday_board_issues;
create policy "staff read" on public.monday_board_issues for select using (is_staff());
-- (sync functions and the watchdog write via the service role, which bypasses RLS.)

-- Columns appended AFTER monday_synced_at so create-or-replace keeps the order.
-- security_invoker restated so the caller's RLS keeps applying (staff see all;
-- clients see their own row with the issue columns null).
create or replace view public.account_sync_health
with (security_invoker = true) as
 SELECT a.id,
    a.company,
    a.short_name,
    a.monday_board_id IS NOT NULL AND a.monday_board_id <> ''::text AS has_monday,
    a.zendesk_org_id IS NOT NULL AND a.zendesk_org_id <> ''::text AS has_zendesk,
    a.whatconverts_profile_id IS NOT NULL AND a.whatconverts_profile_id <> ''::text AS has_wc,
    COALESCE(a.wc_qualified_total, 0) AS qualified,
    ( SELECT count(*) FROM leads l WHERE l.account_id = a.id) AS leads,
    ( SELECT count(*) FROM projects p WHERE p.account_id = a.id) AS projects,
    ( SELECT count(*) FROM recurring_services s WHERE s.account_id = a.id) AS services,
    ( SELECT count(*) FROM action_items ai WHERE ai.account_id = a.id) AS actions,
    GREATEST(
      ( SELECT max(l.created_at) FROM leads l WHERE l.account_id = a.id),
      ( SELECT max(p.created_at) FROM projects p WHERE p.account_id = a.id)
    ) AS last_sync,
    mss.board_items,
    mss.synced_rows,
    mss.synced_at AS monday_synced_at,
    mi.issue AS monday_issue,
    ri.issue AS roadmap_issue
   FROM accounts a
   LEFT JOIN monday_sync_status mss ON mss.account_id = a.id
   LEFT JOIN monday_board_issues mi ON mi.account_id = a.id AND mi.board_role = 'main'
   LEFT JOIN monday_board_issues ri ON ri.account_id = a.id AND ri.board_role = 'roadmap';

grant select on public.account_sync_health to authenticated;
