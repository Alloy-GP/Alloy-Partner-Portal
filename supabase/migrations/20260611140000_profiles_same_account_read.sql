-- Account Details page ("Team seats" + "Your Alloy team") needs a signed-in
-- user to read every profile on THEIR OWN account (names/roles/initials only;
-- email lives in auth.users and is NOT exposed here). Staff already read all
-- via the "staff read" policy; this adds the same-account case for clients.
create policy "same account profiles" on public.profiles
  for select to authenticated
  using (account_id = public.current_account_id());
