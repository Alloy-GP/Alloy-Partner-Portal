-- Monday has a "Waiting" status that was being collapsed into "in-progress".
-- Make it a first-class project status so it can be filtered + labeled distinctly.
alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check
  check (status = any (array['planning','assigned','in-progress','waiting','review','live']));
