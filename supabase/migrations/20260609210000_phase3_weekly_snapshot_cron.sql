-- Weekly snapshot automation (pg_cron + pg_net). Schedules run in UTC.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Friday ~8am CT (13:00 UTC): generate drafts (syncs Monday first, isolates
-- each client, flags anomalies).
select cron.schedule('weekly-snapshot-generate', '0 13 * * 5', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/generate-snapshot',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- Friday ~5pm CT (22:00 UTC): auto-send the CLEAN (un-flagged) drafts; flagged
-- ones stay drafts for manual review.
select cron.schedule('weekly-snapshot-autosend', '0 22 * * 5', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/auto-send-snapshots',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
