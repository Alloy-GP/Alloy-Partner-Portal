-- Pause the month-end auto-publish + email of snapshots until the auto-send
-- flow is finalized. Draft GENERATION (monthly-snapshot-generate) stays on, so
-- staff can review and send manually via the admin console (approve_snapshot).
-- Direct UPDATEs on cron.job are blocked; use the pg_cron helper. Re-enable by
-- running the same with active := true.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'monthly-snapshot-autosend'),
  active := false
);
