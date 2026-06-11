-- "planned" = items synced from the Monday "Planned Work" group (Account page
-- "On the horizon"). loadData keeps these out of the active project views.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status = any (array['planning','assigned','in-progress','waiting','review','live','planned']));
