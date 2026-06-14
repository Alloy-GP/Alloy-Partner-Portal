-- Analytics cache + daily refresh for the Visibility page.
-- Ahrefs is slow (~8-9s/account). The `analytics` edge function caches per
-- (account, range); a daily cron pre-warms the default range so loads are
-- instant and data is at most ~1 day old.

-- Per-(account, range) cached payload. Service-role only (RLS on, no policies);
-- the edge function reads/writes with the service key, which bypasses RLS.
create table if not exists public.analytics_cache (
  account_id uuid not null references public.accounts(id) on delete cascade,
  range text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (account_id, range)
);
alter table public.analytics_cache enable row level security;

-- Small internal config table for secrets the edge functions read via the
-- service role (kept out of the repo). Service-role only.
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

-- Generate the analytics cron secret once (value lives only in the DB).
insert into public.app_config (key, value)
values ('analytics_cron_secret', gen_random_uuid()::text)
on conflict (key) do nothing;

-- Daily pre-warm at 10:20 UTC (between the other morning syncs). Passes the
-- secret from app_config so the value is never hard-coded here.
select cron.schedule(
  'analytics-refresh-daily',
  '20 10 * * *',
  $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/analytics',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'action', 'refresh',
      'range', '12mo',
      'secret', (select value from public.app_config where key = 'analytics_cron_secret')
    ),
    timeout_milliseconds := 150000
  );
  $$
);
