-- Every cron job that calls a SYNC_SECRET-gated edge function must SEND the secret.
--
-- Why: commit fb0f711 (2026-08-17) created SYNC_SECRET to fail-close the two
-- WhatConverts endpoints and updated THEIR two cron jobs to send it as an
-- x-sync-secret header. Every other verify_jwt:false sync function was gated by
-- `if (expected && provided !== expected)` — dormant while the secret was unset,
-- armed the moment it existed — and their cron jobs still sent nothing. From
-- 2026-08-17 16:01 UTC every run of monday-daily (*/30), monday-roadmap-30min,
-- dash-assets-daily, quickbooks-daily and monthly-snapshot-generate returned 401.
-- On 2026-09-09 Sync Health showed all nine boards "23d ago", every row of
-- monday_sync_status had synced_at = 2026-08-17 16:00-16:01, and
-- net._http_response held the 401s right beside the WhatConverts 200s.
--
-- The secret is copied in SQL from the job that already carries it, so it never
-- appears in this file or in git. Header, not URL, so it stays out of request
-- logs. Jobs are looked up by name (ids drift across environments).
do $$
declare
  s text;
  h text;
  j bigint;
  r record;
begin
  select substring(command from 'x-sync-secret"\s*:\s*"([^"]+)"') into s
    from cron.job where jobname = 'whatconverts-daily';
  if s is null or s = '' then
    raise exception 'x-sync-secret not found on cron job whatconverts-daily; that job must carry the secret first';
  end if;
  h := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', s)::text;

  for r in
    select * from (values
      ('monday-daily',              'sync-monday',         180000, ''),
      ('monday-roadmap-30min',      'sync-monday-roadmap', 180000, ''),
      ('dash-assets-daily',         'sync-dash-assets',    120000, ''),
      ('quickbooks-daily',          'sync-quickbooks',     120000, ''),
      -- the month-end pair keeps its "only on the last day of the month" guard
      ('monthly-snapshot-generate', 'generate-snapshot',   120000, ' where extract(day from ((now() at time zone ''utc'') + interval ''1 day'')) = 1'),
      ('monthly-snapshot-autosend', 'auto-send-snapshots', 120000, ' where extract(day from ((now() at time zone ''utc'') + interval ''1 day'')) = 1')
    ) as t(name, fn, tmo, guard)
  loop
    select jobid into j from cron.job where jobname = r.name;
    if j is null then
      raise notice 'cron job % not found - skipped', r.name;
      continue;
    end if;
    perform cron.alter_job(j, command => format(
      $c$select net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := %s)%s;$c$,
      'https://aryttfcmleukwstknvio.supabase.co/functions/v1/' || r.fn, h, r.tmo, r.guard));
    raise notice 'cron job % (jobid %) now sends x-sync-secret', r.name, j;
  end loop;
end $$;
