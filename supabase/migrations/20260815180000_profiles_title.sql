-- profiles.title — a person's actual job title.
--
-- The proposal owner picker and the board document both name a real person now
-- (20260814 owner work), but profiles had nowhere to record what that person DOES.
-- The only role information is profiles.role, which is a PERMISSION level
-- (owner | staff | accounting), so Amanda Betancourt — CMGT's COO — was labelled
-- "Team" and Jeff Harman, its CEO & founder, was labelled "Owner". The board
-- document shows that label to a prospect, so a board was told its contact's job
-- title was a portal permission tier.
--
-- Kept deliberately separate from `role`: one governs what you can do in the
-- portal, the other is what appears on a proposal. Conflating them is what
-- produced the wrong label.
alter table public.profiles add column if not exists title text;

comment on column public.profiles.title is
  'Human job title for display on proposals and the board document (e.g. "COO", "CEO & Founder"). Distinct from profiles.role, which is the portal PERMISSION level (owner|staff|accounting) and must never be shown to a prospect as a job title.';

-- ── thread the same field through the INVITE path ────────────────────────────
-- The Admin console writes an invite row, and handle_new_user() copies that row
-- into profiles when the person first signs in. Adding the column to profiles
-- alone would mean a title set at invite time silently vanished for every NEW
-- user — the exact "added it at the source and the consumer, skipped the middle
-- layer" failure CLAUDE.md warns about.
alter table public.account_invites add column if not exists title text;

comment on column public.account_invites.title is
  'Job title captured at invite time; copied into profiles.title by handle_new_user().';

-- Re-declare the signup trigger to carry title across. This is the LIVE body
-- verbatim (pg_get_functiondef) with `title` added to the insert only — including
-- its `if found then` guard rather than a rewritten equivalent, because this runs
-- on every new user signup and a restructure is risk with no upside.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv public.account_invites;
begin
  select * into inv
  from public.account_invites
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    insert into public.profiles (id, account_id, role, is_staff, name, initials, title)
    values (
      new.id,
      inv.account_id,
      inv.role,
      inv.is_staff,
      coalesce(inv.name, split_part(new.email, '@', 1)),
      inv.initials,
      inv.title
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$function$;

-- SECURITY DEFINER: never browser-executable (it only ever runs as an auth trigger).
revoke all on function public.handle_new_user() from public, anon, authenticated;
