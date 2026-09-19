-- Sync watchdog: know when ANY unattended sync fails or stops running.
--
-- Until now a sync could 401 for 23 days (2026-08-17 -> 09-09) and the only
-- signal was a red "Nd ago" on a staff-only card. Three pieces:
--   1. cron_http_requests: every pg_cron job records the pg_net request id it
--      fires (all commands are wrapped below), so a row in net._http_response
--      can be attributed to a job. pg_net keeps responses ~6h, hence...
--   2. sync_runs: the durable log. The sync-monitor edge function (cron, every
--      10 min) harvests pending results, classifies them (HTTP status, timeout,
--      body ok:false / failed>0 / per-account errors) and stores them.
--   3. sync_alerts: open/resolved state per problem, so staff get ONE email when
--      a job starts failing or goes stale, a daily reminder while it stays
--      broken, and one when it recovers. Sync Health renders the same rows.
--
-- Staleness is judged from cron.job itself (every ACTIVE job must have a run
-- inside its window), so a future job created WITHOUT the wrapper still shows
-- up: it looks permanently stale until someone wraps it.

create table if not exists public.cron_http_requests (
  request_id   bigint primary key,
  job_name     text not null,
  requested_at timestamptz not null default now(),
  harvested_at timestamptz
);
create index if not exists cron_http_requests_pending
  on public.cron_http_requests (requested_at) where harvested_at is null;
alter table public.cron_http_requests enable row level security;
revoke all on public.cron_http_requests from anon, authenticated;  -- SQL + service role only

create table if not exists public.sync_runs (
  id          bigserial primary key,
  source      text not null,                 -- cron job name, e.g. monday-daily
  trigger     text not null default 'cron',
  started_at  timestamptz not null,          -- when the request was fired
  finished_at timestamptz,                   -- when pg_net recorded the response
  ok          boolean not null,
  status_code integer,
  error       text,
  summary     jsonb,
  request_id  bigint
);
create index if not exists sync_runs_source_started on public.sync_runs (source, started_at desc);
create index if not exists sync_runs_started on public.sync_runs (started_at desc);
-- one row per pg_net request: the harvest upserts on this, so a retry never duplicates
create unique index if not exists sync_runs_request_id on public.sync_runs (request_id);
alter table public.sync_runs enable row level security;
drop policy if exists "staff read" on public.sync_runs;
create policy "staff read" on public.sync_runs for select using (is_staff());

create table if not exists public.sync_alerts (
  id               bigserial primary key,
  key              text not null,            -- kind:source, e.g. fail:monday-daily
  kind             text not null,            -- fail | stale
  source           text not null,
  detail           jsonb,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  last_notified_at timestamptz,
  notify_count     integer not null default 0,
  resolved_at      timestamptz
);
create unique index if not exists sync_alerts_open_key on public.sync_alerts (key) where resolved_at is null;
alter table public.sync_alerts enable row level security;
drop policy if exists "staff read" on public.sync_alerts;
create policy "staff read" on public.sync_alerts for select using (is_staff());

-- Service-role-only RPCs. security definer so they can read net.* / cron.*;
-- EXECUTE is revoked from anon/authenticated (PostgREST exposes functions to
-- any role that can execute them - the snapshot_recipient_emails lesson).
create or replace function public.sync_pending_cron_results()
returns table (request_id bigint, job_name text, requested_at timestamptz, responded_at timestamptz,
               status_code integer, timed_out boolean, error_msg text, content text)
language sql security definer set search_path = public, pg_temp as $$
  select q.request_id, q.job_name, q.requested_at, r.created,
         r.status_code, r.timed_out, r.error_msg, left(r.content, 8000)
  from public.cron_http_requests q
  left join net._http_response r on r.id = q.request_id
  where q.harvested_at is null
    and (r.id is not null or q.requested_at < now() - interval '10 minutes')
  order by q.requested_at;
$$;

create or replace function public.sync_mark_harvested(ids bigint[])
returns integer language sql security definer set search_path = public, pg_temp as $$
  with u as (
    update public.cron_http_requests set harvested_at = now()
    where request_id = any(ids) and harvested_at is null returning 1
  ) select count(*)::integer from u;
$$;

create or replace function public.sync_cron_jobs()
returns table (jobid bigint, jobname text, schedule text, active boolean)
language sql security definer set search_path = public, pg_temp as $$
  select jobid, jobname, schedule, active from cron.job order by jobid;
$$;

revoke all on function public.sync_pending_cron_results() from public, anon, authenticated;
revoke all on function public.sync_mark_harvested(bigint[]) from public, anon, authenticated;
revoke all on function public.sync_cron_jobs() from public, anon, authenticated;

-- Tracking start: a job with no run yet is measured from here, not from 1970.
insert into public.app_config (key, value) values ('sync_monitor_since', now()::text)
on conflict (key) do nothing;

do $$
declare
  s text; h text; r record; base text; wrapped text;
begin
  select substring(command from 'x-sync-secret"\s*:\s*"([^"]+)"') into s
    from cron.job where jobname = 'whatconverts-daily';
  if s is null or s = '' then
    raise exception 'x-sync-secret not found on cron job whatconverts-daily';
  end if;
  h := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', s)::text;

  -- The watchdog itself, every 10 minutes (same header contract as every sync).
  if not exists (select 1 from cron.job where jobname = 'sync-monitor-10min') then
    perform cron.schedule('sync-monitor-10min', '*/10 * * * *', format(
      $c$select net.http_post(url := 'https://aryttfcmleukwstknvio.supabase.co/functions/v1/sync-monitor', headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);$c$, h));
  end if;

  -- Wrap every job so its pg_net request id lands in cron_http_requests under
  -- the job name. Idempotent (skips already-wrapped commands). Each wrapped
  -- command is EXPLAINed - planned, not run - so a bad wrap aborts this whole
  -- migration instead of silently breaking a job.
  for r in select jobid, jobname, command from cron.job loop
    if r.command ~ 'cron_http_requests' then continue; end if;
    base := regexp_replace(r.command, '\s*;?\s*$', '');
    wrapped := format(
      'insert into public.cron_http_requests (job_name, request_id) select %L, t.request_id from (%s) as t(request_id);',
      r.jobname, base);
    execute 'explain ' || wrapped;
    perform cron.alter_job(r.jobid, command => wrapped);
    raise notice 'wrapped cron job % (%)', r.jobname, r.jobid;
  end loop;
end $$;
