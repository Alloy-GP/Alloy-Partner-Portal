-- Drift detection for the Monday sync.
--
-- The existing Sync Health view only flags "mapped but empty" (count = 0) and
-- ">36h stale". Neither catches a PARTIAL under-sync: RISE showed 207 projects
-- (non-empty) synced <36h ago while the board actually had 534 — 327 items
-- silently missing (a missed bulk webhook + a 500-item page cap). To catch that
-- class of failure we store the board's authoritative item count and the rows
-- we actually wrote each run, and surface board-vs-synced drift in Sync Health.
create table if not exists monday_sync_status (
  account_id  uuid primary key references accounts(id) on delete cascade,
  board_items integer,       -- Monday boards.items_count (all groups, excl subitems)
  synced_rows integer,       -- projects + actions + toolkit written this run
  synced_at   timestamptz default now()
);
alter table monday_sync_status enable row level security;
drop policy if exists "staff read" on monday_sync_status;
create policy "staff read" on monday_sync_status for select using (is_staff());
-- (sync-monday writes via service role, which bypasses RLS.)

-- New columns appended AFTER last_sync so create-or-replace keeps column order.
create or replace view account_sync_health as
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
    mss.synced_at AS monday_synced_at
   FROM accounts a
   LEFT JOIN monday_sync_status mss ON mss.account_id = a.id;
