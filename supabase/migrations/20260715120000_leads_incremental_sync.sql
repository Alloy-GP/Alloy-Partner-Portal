-- Incremental lead sync (replaces delete-all-then-insert). `last_synced_at` marks
-- rows written by the current sync run; the sync upserts by (account_id,
-- wc_lead_id) then prunes rows it did NOT touch -- so there's never a window where
-- the table is empty, and far less write churn. The unique index is the upsert
-- conflict target.
alter table leads add column if not exists last_synced_at timestamptz;
create unique index if not exists leads_account_wc_lead_uk on leads (account_id, wc_lead_id);
