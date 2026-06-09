-- Debounce/coalesce rapid Monday webhook bursts: each webhook records its time
-- here; the sync waits briefly and only the latest event in a burst proceeds.
-- Prevents a slow sync (triggered by an earlier change, reading stale data)
-- from clobbering a fresh one. Service-role only (RLS on, no policies).
create table if not exists public.monday_sync_debounce (
  board_id text primary key,
  requested_at timestamptz not null default now()
);
alter table public.monday_sync_debounce enable row level security;
