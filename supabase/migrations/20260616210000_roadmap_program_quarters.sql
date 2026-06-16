-- Phase 3: the Growth Engine program quarters (Plan -> Build -> Prove cycle).
-- Driven by a per-client Monday "Program" board: one item per calendar quarter
-- with a Proof (X->Y) line + Playbook/Report deliverable links. Initiatives are
-- reused from the synced projects (grouped by quarter via due-date).

alter table public.accounts add column if not exists monday_program_board_id text;

create table public.program_quarters (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  monday_item_id  text,
  label           text,                 -- quarter title/theme (item name)
  quarter_start   date,                 -- first day of the quarter; drives order, state, project slotting
  proof           text,                 -- "because we did X, you got Y"
  playbook_url    text,
  report_url      text,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
create index on public.program_quarters(account_id);
create unique index on public.program_quarters(account_id, monday_item_id);

alter table public.program_quarters enable row level security;
create policy "acct read" on public.program_quarters
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.program_quarters
  for select to authenticated using (public.is_staff());
