-- Scoped read: a user can read (and the upload can read back) only their own
-- avatar objects — not list the whole bucket. Public display still works via
-- the public object URL regardless of this policy.
create policy "avatars own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
