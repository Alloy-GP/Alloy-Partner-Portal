-- Weekly lifetime tenure rollup (qualified totals + by source). Mondays 11:10 UTC.
select cron.schedule('whatconverts-rollup-weekly', '10 11 * * 1', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/rollup-whatconverts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
$$);
