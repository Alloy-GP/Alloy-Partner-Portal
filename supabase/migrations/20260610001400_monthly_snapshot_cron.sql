-- Switch snapshot automation from weekly (Fridays) to monthly (last day of month).
-- pg_cron has no "last day" token, so run on days 28-31 and only fire when
-- tomorrow is the 1st (i.e. today is genuinely the last day, any month length).
select cron.unschedule(jobname) from cron.job
  where jobname in ('weekly-snapshot-generate','weekly-snapshot-autosend');

select cron.schedule('monthly-snapshot-generate', '0 13 28-31 * *', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/generate-snapshot',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where extract(day from ((now() at time zone 'utc') + interval '1 day')) = 1;
$$);

select cron.schedule('monthly-snapshot-autosend', '0 22 28-31 * *', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/auto-send-snapshots',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where extract(day from ((now() at time zone 'utc') + interval '1 day')) = 1;
$$);
