-- Daily FULL Monday sync across all boards. Monday previously synced only on
-- per-board webhooks, so a board that never fired one (or missed it) went stale
-- (e.g. only RISE had projects/tickets). This guarantees every mapped board
-- refreshes daily regardless of webhooks.
select cron.schedule('monday-daily', '0 10 * * *', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/sync-monday',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
$$);
