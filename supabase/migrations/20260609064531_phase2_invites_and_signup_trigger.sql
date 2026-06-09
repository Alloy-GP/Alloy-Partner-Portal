-- ============================================================
-- Access control: invite-gated per-account membership.
-- An invite ties an email to an account + role. When that email signs up
-- (first magic link), a trigger auto-creates their profile on that account.
-- No invite => no profile => no account => "no access" in the app.
-- ============================================================

create table public.account_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  role        text check (role in ('owner','bd','ops')) default 'owner',
  is_staff    boolean not null default false,
  name        text,
  initials    text,
  created_at  timestamptz not null default now()
);
create unique index account_invites_email_key on public.account_invites (lower(email));
create index account_invites_account_idx on public.account_invites (account_id);

-- Locked down: only the SECURITY DEFINER trigger / service role touch it.
alter table public.account_invites enable row level security;

-- On new auth user, provision their profile from a matching invite.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.account_invites;
begin
  select * into inv
  from public.account_invites
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    insert into public.profiles (id, account_id, role, is_staff, name, initials)
    values (
      new.id,
      inv.account_id,
      inv.role,
      inv.is_staff,
      coalesce(inv.name, split_part(new.email, '@', 1)),
      inv.initials
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill invites for the two staff users that already have profiles,
-- so the invite table is the single source of truth going forward.
insert into public.account_invites (email, account_id, role, is_staff, name, initials)
select v.email, (select id from public.accounts where short_name='RISE'),
       v.role, true, v.name, v.initials
from (values
  ('skyler@alloygp.co','owner','Skyler Nelson','SN'),
  ('justin@alloygp.co','bd','Justin Guenther','JG')
) as v(email,role,name,initials)
on conflict (lower(email)) do nothing;
