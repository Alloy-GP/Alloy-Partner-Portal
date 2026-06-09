-- Public buckets serve object URLs without a SELECT policy. The broad SELECT
-- policy only enabled *listing* every avatar, which we don't want. Drop it;
-- direct avatar URLs still load. (A scoped own-read policy is added in
-- 20260609070339 so the upload can read the object back.)
drop policy if exists "avatars public read" on storage.objects;

-- handle_new_user is a signup trigger; it must never be callable as an RPC.
-- Triggers fire regardless of caller EXECUTE grants, so revoking is safe.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
