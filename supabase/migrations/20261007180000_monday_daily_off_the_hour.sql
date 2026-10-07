-- monday-daily: run at :10 and :40, not :00 and :30.
--
-- Every one of the 38 IDLE_TIMEOUT (504) failures of monday-daily in the 14 days
-- to 2026-10-07 happened on a :00 tick; none on a :30 tick. Same code, same ten
-- boards, same neighbours (whatconverts-daily also runs at :00 AND :30, and is
-- fine at both). Whatever is slow at the top of the hour - Monday's own
-- automations and everyone else's hourly crons hitting its API - is not ours to
-- fix; the job can simply not run then. sync-monday now also carries a 110s
-- run budget, so a slow tick skips boards to the next tick instead of timing
-- out; moving off the slow minute means that rarely has to happen.
--
-- Job looked up by name (ids drift across environments). The watchdog derives
-- the job's silence window from the schedule ("10,40" -> every 30 min -> 2h),
-- so nothing else changes.
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname = 'monday-daily';
  if j is null then raise exception 'cron job monday-daily not found'; end if;
  perform cron.alter_job(j, schedule => '10,40 * * * *');
end $$;
