-- Client goal parameters (shown on the dashboard hero, set in admin).
alter table public.accounts add column if not exists goal_label   text default 'boards signed';
alter table public.accounts add column if not exists goal_current int  default 0;
alter table public.accounts add column if not exists goal_target  int  default 0;

-- Keep RISE's dashboard goal as it was (3 of 8 boards).
update public.accounts set goal_label = 'boards signed', goal_current = 3, goal_target = 8
where short_name = 'RISE' and coalesce(goal_target, 0) = 0;

-- Resolve an email to its auth user id (admin/service-role use only) so the
-- admin function can provision/revoke a profile for an already-existing user.
create or replace function public.auth_uid_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_uid_by_email(text) from anon, authenticated, public;
