-- Per-client square brand icon (top-left of the dashboard).
alter table public.accounts add column if not exists logo_url text;
update public.accounts set logo_url = '/assets/rise-mark.svg'
where short_name = 'RISE' and logo_url is null;

-- Staff check for storage policies (SECURITY DEFINER to avoid RLS recursion).
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_staff from public.profiles where id = auth.uid()), false); $$;
revoke execute on function public.is_staff() from anon, public;
grant  execute on function public.is_staff() to authenticated;

-- logos bucket: public display via object URL; staff manage. Scoped SELECT
-- (own/staff) avoids the "public bucket allows listing" advisory.
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos staff read" on storage.objects
  for select to authenticated using (bucket_id = 'logos' and public.is_staff());
create policy "logos staff write" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos' and public.is_staff());
create policy "logos staff update" on storage.objects
  for update to authenticated using (bucket_id = 'logos' and public.is_staff())
  with check (bucket_id = 'logos' and public.is_staff());
create policy "logos staff delete" on storage.objects
  for delete to authenticated using (bucket_id = 'logos' and public.is_staff());
