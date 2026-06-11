-- Nightly QuickBooks invoice sync (invoices change ~monthly, occasionally ad-hoc;
-- nightly keeps the portal current without webhooks). Mirrors whatconverts-daily.
-- Apply only AFTER the QBO connection is bootstrapped (QBO_CLIENT_ID/SECRET +
-- first refresh token), else it logs a "not connected" error each night.
select cron.schedule('quickbooks-daily', '30 11 * * *', $$
  select net.http_post(
    url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/sync-quickbooks',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
