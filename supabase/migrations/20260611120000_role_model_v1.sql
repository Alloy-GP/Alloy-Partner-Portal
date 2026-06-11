-- Role model v1. is_staff = Alloy vs client; role = level within that side.
-- Alloy: admin | staff.   Client: owner | staff | accounting.
-- ('staff' is shared across both sides; is_staff disambiguates.)
-- The capability matrix that maps these to what each can see/do lives in
-- src/lib/perms.js (single source of truth).

-- 1) Drop old constraints FIRST so the remap can write new values.
alter table public.account_invites drop constraint if exists account_invites_role_check;
alter table public.profiles drop constraint if exists profiles_role_check;

-- 2) Remap existing rows to canonical values.
update public.profiles p set role = 'admin'
  from auth.users u where u.id = p.id and lower(u.email) = 'skyler@alloygp.co';
update public.profiles p set role = 'staff'
  from auth.users u where u.id = p.id and lower(u.email) = 'justin@alloygp.co';
update public.account_invites set role = 'admin' where lower(email) = 'skyler@alloygp.co';
update public.account_invites set role = 'staff' where lower(email) = 'justin@alloygp.co';

-- Normalize any stray legacy values.
update public.profiles set role = 'staff' where role in ('bd','ops');
update public.account_invites set role = 'staff' where role in ('bd','ops');

-- 3) Lock the canonical set on both tables.
alter table public.account_invites
  add constraint account_invites_role_check check (role in ('admin','staff','owner','accounting'));
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','staff','owner','accounting'));
