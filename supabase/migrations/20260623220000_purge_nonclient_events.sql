-- Purge non-client activity from the `events` table so admin analytics is
-- backed by real client data, not legacy noise. Mirrors the read-time filter
-- in the `admin` edge function's "analytics" action.
--
-- Deletes events that are:
--   1. orphaned       — no account_id, or an account_id that no longer exists
--                       (the source of the old "Unknown" client row), or
--   2. Alloy's own    — the user is flagged is_staff, or their auth email is on
--                       an Alloy domain (e.g. alloygp.co). Alloy is not a client.
--
-- Destructive and irreversible. Events are analytics-only (no FKs depend on
-- them), so this is safe to run.
delete from public.events e
where e.account_id is null
   or not exists (select 1 from public.accounts a where a.id = e.account_id)
   or exists (
        select 1 from public.profiles p
        where p.id = e.user_id and p.is_staff
      )
   or exists (
        select 1 from auth.users u
        where u.id = e.user_id
          and lower(split_part(u.email, '@', 2)) like '%alloy%'
      );
