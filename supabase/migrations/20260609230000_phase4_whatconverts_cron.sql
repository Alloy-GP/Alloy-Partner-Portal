-- Daily WhatConverts leads sync (keeps the dashboard current between snapshots).
select cron.schedule('whatconverts-daily', '0 11 * * *', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/sync-whatconverts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
