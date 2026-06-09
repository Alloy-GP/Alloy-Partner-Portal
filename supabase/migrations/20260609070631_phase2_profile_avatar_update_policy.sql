-- Users may update ONLY their own avatar_url. Column-level grant prevents
-- changing account_id / role / is_staff even though the row is theirs.
revoke update on public.profiles from anon, authenticated;
grant  update (avatar_url) on public.profiles to authenticated;

create policy "update own profile avatar" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
