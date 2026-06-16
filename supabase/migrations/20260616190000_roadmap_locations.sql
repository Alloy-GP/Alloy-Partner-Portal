-- Multi-location Growth Roadmap (Phase 1): markets as tracks on the five-stage
-- journey (Foundation -> Traction -> Momentum -> Expansion -> Dominance).
-- Driven by a per-client Monday "Markets" board: one item per market with a
-- Stage status column + milestone subitems (Done / Done At).

alter table public.accounts add column if not exists monday_roadmap_board_id text;

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  monday_item_id  text,
  name            text not null,
  role            text,
  onboarded       date,
  stage           int not null default 0,          -- 0..4 index into the five stages
  metric_value    text,
  metric_label    text,
  metric_delta    text,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
create index on public.locations(account_id);
create unique index on public.locations(account_id, monday_item_id);

create table public.location_milestones (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  idx           int not null,                       -- 0..4 position within current stage
  label         text,
  done          boolean not null default false,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.location_milestones(location_id);

alter table public.locations enable row level security;
alter table public.location_milestones enable row level security;

create policy "acct read" on public.locations
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.locations
  for select to authenticated using (public.is_staff());

create policy "acct read" on public.location_milestones
  for select to authenticated using (
    exists (select 1 from public.locations l
            where l.id = location_id and l.account_id = public.current_account_id()));
create policy "staff read" on public.location_milestones
  for select to authenticated using (public.is_staff());
