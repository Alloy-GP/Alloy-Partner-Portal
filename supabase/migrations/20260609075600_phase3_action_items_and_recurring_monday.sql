-- Action-queue items: synced from the Monday "Tickets" group where the
-- board Status (source of truth, set by the Zendesk->Monday automation) is in
-- the action set. Kept separate from the (future Zendesk) tickets table.
create table public.action_items (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  monday_item_id text,
  title          text not null,
  due_date       date,
  due_label      text,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index on public.action_items(account_id);
alter table public.action_items enable row level security;
create policy "acct read" on public.action_items
  for select to authenticated using (account_id = public.current_account_id());

-- recurring_services is now Monday-synced too; tag rows with their source item.
alter table public.recurring_services add column if not exists monday_item_id text;
