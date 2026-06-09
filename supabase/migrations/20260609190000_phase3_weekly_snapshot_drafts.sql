-- Weekly snapshot: draft → review → publish lifecycle + week-over-week delta.
alter table public.weekly_snapshots
  add column if not exists status text not null default 'published',
  add column if not exists headline text,
  add column if not exists note text,
  add column if not exists state jsonb,          -- snapshot of project statuses, for next week's diff
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists sent_at timestamptz;

update public.weekly_snapshots set status = 'published' where status is null;

-- Clients only ever read PUBLISHED snapshots; drafts are staff-only until
-- approved. (Staff-read policies already exist on both tables.)
drop policy if exists "acct read" on public.weekly_snapshots;
create policy "client reads published snapshots" on public.weekly_snapshots
  for select to authenticated
  using (account_id = public.current_account_id() and status = 'published');

drop policy if exists "acct read" on public.weekly_snapshot_items;
create policy "client reads published snapshot items" on public.weekly_snapshot_items
  for select to authenticated
  using (exists (
    select 1 from public.weekly_snapshots s
    where s.id = weekly_snapshot_items.snapshot_id
      and s.account_id = public.current_account_id()
      and s.status = 'published'
  ));
