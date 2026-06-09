-- Anomaly flags surfaced in the staff review queue (e.g. sync-empty, high-shipped).
alter table public.weekly_snapshots
  add column if not exists flags jsonb not null default '[]'::jsonb;
