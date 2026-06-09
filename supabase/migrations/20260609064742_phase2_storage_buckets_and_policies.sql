-- Profile photo URL lives on the profile row.
alter table public.profiles add column if not exists avatar_url text;

-- Buckets: avatars (public, lightweight) + documents (private, PDFs).
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true),
  ('documents','documents', false)
on conflict (id) do nothing;

-- ----- avatars: public read; a user manages only files under <their uid>/ -----
-- NOTE: the broad "avatars public read" policy below is dropped in a later
-- migration (20260609065421) and replaced by a scoped own-read policy
-- (20260609070339). Kept here to match applied history.
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars own write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----- documents: private, readable only within your account (<account_id>/...) -----
create policy "documents account read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_account_id()::text);
