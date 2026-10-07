-- Month-end snapshot jobs: let pg_net wait as long as the gateway does.
--
-- 2026-09-30 13:00 UTC: monthly-snapshot-generate was recorded as "timed out"
-- and the watchdog emailed staff four days running. The function had in fact
-- finished - all 11 snapshots were written at 13:02:12-13:02:15 - but pg_net's
-- timeout_milliseconds was 120000, so it gave up 15 seconds before the function
-- returned, and the "failure" only cleared when the run fell out of the
-- monitor's (then truncated) view. The gateway allows 150s; pg_net should wait
-- the same. The wrapped command (and its x-sync-secret) is kept verbatim; only
-- the number changes.
do $$
declare r record;
begin
  for r in select jobid, jobname, command from cron.job
           where jobname in ('monthly-snapshot-generate', 'monthly-snapshot-autosend') loop
    perform cron.alter_job(r.jobid,
      command => replace(r.command, 'timeout_milliseconds := 120000', 'timeout_milliseconds := 150000'));
    raise notice 'cron job % now waits 150s', r.jobname;
  end loop;
end $$;
