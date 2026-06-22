-- The guided tour stamps profiles.tour_completed_at when shown, but the
-- authenticated role only had column-level UPDATE on avatar_url +
-- notification_prefs, so the write was silently rejected and the tour re-popped
-- on every login. Grant UPDATE on just this column (the existing RLS UPDATE
-- policy still restricts it to the user's own row: id = auth.uid()).
grant update (tour_completed_at) on public.profiles to authenticated;
