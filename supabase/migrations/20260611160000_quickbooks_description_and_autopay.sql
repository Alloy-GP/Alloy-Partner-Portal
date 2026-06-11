-- Two billing gaps the Account page needs:
-- 1) Invoice description — the page shows a Description column; capture the QBO
--    first line-item description during sync (was being synthesized client-side).
alter table public.invoices
  add column if not exists description text;

-- 2) Autopay schedule — when staff create a recurring auto-draft, the template
--    lives in QBO; persist a local copy so the portal can show "next draft on
--    the 1st · $X" and "drafted monthly" without a live QBO call. One active
--    schedule per account.
create table if not exists public.autopay_schedules (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  qbo_recurring_txn_id text,
  qbo_item_id          text,
  amount               numeric(14,2),
  billing_day          int,
  start_date           date,
  status               text default 'active',   -- active | inactive
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (account_id)
);

alter table public.autopay_schedules enable row level security;
create policy "acct read" on public.autopay_schedules
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.autopay_schedules
  for select to authenticated using (public.is_staff());
