-- Origin (Cut A): where a quarter's work came from. 'planned' = Monday Type
-- "Playbook"; 'added' = anything else (client-driven / strategic / other).
alter table public.projects add column if not exists origin text;

-- Toolkit: opt-in systems the client has switched on. One row per item in the
-- Monday "Toolkit" group. Separate dataset from projects/services.
create table if not exists public.toolkit_systems (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  monday_item_id text,
  name text not null,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists toolkit_systems_account_id_idx on public.toolkit_systems(account_id);

alter table public.toolkit_systems enable row level security;
create policy "acct read" on public.toolkit_systems
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.toolkit_systems
  for select to authenticated using (public.is_staff());
