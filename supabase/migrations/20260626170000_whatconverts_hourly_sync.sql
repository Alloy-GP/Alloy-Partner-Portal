-- WhatConverts leads were syncing only once a day (11:00 UTC), so leads that
-- arrived during the day didn't appear in the portal until the next morning —
-- read as "leads not coming in." Poll hourly instead so new leads show within
-- the hour. (The function is a cheap delete+insert per account and finishes all
-- accounts well within one invocation's limits.)
-- Applied live via cron.alter_job (the migration role lacks privileges on
-- cron.job, so this is wrapped to no-op rather than fail a `db push`).
do $$
begin
  update cron.job set schedule = '0 * * * *'
  where command ilike '%sync-whatconverts%';
exception when insufficient_privilege then
  raise notice 'skipping cron.job update (insufficient privilege); apply via cron.alter_job';
end $$;
