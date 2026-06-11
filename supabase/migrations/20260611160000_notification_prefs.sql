-- Per-user notification preferences (Account page Notifications card).
-- v1 keys: monthly_snapshot (gates the snapshot email), lead_alerts (gates the
-- in-portal "leads to qualify" bell). Default {} = everything ON.
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- Let a signed-in user update their own prefs (row policy "update own profile
-- avatar" already restricts to id = auth.uid(); this adds the column grant).
grant update (notification_prefs) on public.profiles to authenticated;

-- Snapshot recipients for an account = non-staff invite emails, MINUS anyone
-- whose profile has monthly_snapshot explicitly off. Unset / not-yet-signed-up
-- defaults to ON. Both send paths (admin manual + auto-send) call this so the
-- pref is honored everywhere from one place.
create or replace function public.snapshot_recipient_emails(p_account_id uuid)
returns setof text
language sql
security definer
set search_path = public, auth
as $$
  select i.email
  from public.account_invites i
  where i.account_id = p_account_id
    and i.is_staff = false
    and i.email is not null
    and not exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower(i.email)
        and coalesce((p.notification_prefs ->> 'monthly_snapshot')::boolean, true) = false
    );
$$;
