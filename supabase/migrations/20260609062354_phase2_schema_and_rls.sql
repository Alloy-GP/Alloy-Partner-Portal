-- ============================================================
-- Alloy Partner Portal — Phase 2 schema (multi-tenant + RLS)
-- ============================================================

-- ---------- Tenant ----------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  company     text not null,
  short_name  text,
  tier        text,
  market      text,
  since       text,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  account_id  uuid references public.accounts(id) on delete set null,
  name        text,
  initials    text,
  role        text check (role in ('owner','bd','ops')) default 'owner',
  is_staff    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Returns the signed-in user's account_id. SECURITY DEFINER so RLS policies
-- on other tables can call it without recursing into profiles' own RLS.
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id from public.profiles where id = auth.uid();
$$;

-- ---------- Work ----------
create table public.recurring_services (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null,
  short       text,
  cadence     text,
  lane        text,
  color       text,
  last_touch  text,
  note        text,
  health      text,
  sort        int not null default 0
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  code        text,                 -- e.g. PR-218
  title       text not null,
  phase       text,
  engines     text[] default '{}',  -- reach|match|retain
  pct         int default 0,
  status      text check (status in ('planning','assigned','in-progress','review','live')),
  due_label   text,                 -- humanized "Apr 12"
  due_rel     text,                 -- "in 26 days"
  owners      text[] default '{}',  -- initials
  pulse       text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null,
  source      text,
  quality     text check (quality in ('hot','qualified','review')),
  value       text,
  type        text check (type in ('call','form')),
  time_label  text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  code        text,                 -- e.g. ZD-4218
  title       text not null,
  priority    text check (priority in ('low','med','high')),
  status      text check (status in ('open','in-progress','answered','closed')),
  agent       text,
  excerpt     text,
  time_label  text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.activity (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  color       text,
  text        text not null,
  meta        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Reporting ----------
create table public.weekly_snapshots (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  week_label        text,
  pdf_path          text,
  quarterly_href    text,
  summary_waiting   int default 0,
  summary_leads     int default 0,
  summary_completed int default 0,
  leads_value       text,
  is_current        boolean not null default false,
  sort              int not null default 0,
  created_at        timestamptz not null default now()
);

create table public.weekly_snapshot_items (
  id          uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.weekly_snapshots(id) on delete cascade,
  kind        text check (kind in ('waiting','completed','upcoming')),
  text        text not null,
  meta        text,
  sort        int not null default 0
);

create table public.roadmap_quarters (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  quarter     text,
  months      text,
  title       text,
  state       text check (state in ('done','now','next','future')),
  pdf_path    text,
  sort        int not null default 0
);

create table public.roadmap_focuses (
  id          uuid primary key default gen_random_uuid(),
  quarter_id  uuid not null references public.roadmap_quarters(id) on delete cascade,
  text        text not null,
  status      text check (status in ('complete','pending','missed')),
  sort        int not null default 0
);

create table public.roi (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  year_label       text,
  invested         numeric,
  contract_value   numeric,
  boards_signed    int,
  ratio            numeric,
  rankings_tracked int,
  rankings_top10   int
);

create table public.kpis (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  label       text,
  value       text,
  trend       text,
  up          boolean,
  icon        text,
  tone        text,
  sort        int not null default 0
);

-- ---------- Engagement / content ----------
create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  color       text,
  category    text
);

create table public.account_badges (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  badge_id     uuid not null references public.badges(id) on delete cascade,
  state        text check (state in ('earned','progress','locked')),
  pct          int,
  earned_label text,
  sort         int not null default 0,
  unique (account_id, badge_id)
);

create table public.library_resources (
  id          uuid primary key default gen_random_uuid(),
  lane        text,
  stage       text,
  title       text not null,
  meta        text,
  description text,
  sort        int not null default 0
);

-- ---------- Indexes on FKs ----------
create index on public.profiles(account_id);
create index on public.recurring_services(account_id);
create index on public.projects(account_id);
create index on public.leads(account_id);
create index on public.tickets(account_id);
create index on public.activity(account_id);
create index on public.weekly_snapshots(account_id);
create index on public.weekly_snapshot_items(snapshot_id);
create index on public.roadmap_quarters(account_id);
create index on public.roadmap_focuses(quarter_id);
create index on public.roi(account_id);
create index on public.kpis(account_id);
create index on public.account_badges(account_id);
create index on public.account_badges(badge_id);

-- ============================================================
-- Row-Level Security: enable on every table, default-deny.
-- Read (SELECT) only for now; writes added when features need them.
-- ============================================================
alter table public.accounts              enable row level security;
alter table public.profiles              enable row level security;
alter table public.recurring_services    enable row level security;
alter table public.projects              enable row level security;
alter table public.leads                 enable row level security;
alter table public.tickets               enable row level security;
alter table public.activity              enable row level security;
alter table public.weekly_snapshots      enable row level security;
alter table public.weekly_snapshot_items enable row level security;
alter table public.roadmap_quarters      enable row level security;
alter table public.roadmap_focuses       enable row level security;
alter table public.roi                   enable row level security;
alter table public.kpis                  enable row level security;
alter table public.badges                enable row level security;
alter table public.account_badges        enable row level security;
alter table public.library_resources     enable row level security;

-- Own profile / own account
create policy "own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "own account" on public.accounts
  for select to authenticated using (id = public.current_account_id());

-- Account-scoped reads
create policy "acct read" on public.recurring_services
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.projects
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.leads
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.tickets
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.activity
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.weekly_snapshots
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.roadmap_quarters
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.roi
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.kpis
  for select to authenticated using (account_id = public.current_account_id());
create policy "acct read" on public.account_badges
  for select to authenticated using (account_id = public.current_account_id());

-- Child tables scoped via their parent's account
create policy "acct read" on public.weekly_snapshot_items
  for select to authenticated using (
    exists (select 1 from public.weekly_snapshots s
            where s.id = snapshot_id and s.account_id = public.current_account_id()));
create policy "acct read" on public.roadmap_focuses
  for select to authenticated using (
    exists (select 1 from public.roadmap_quarters q
            where q.id = quarter_id and q.account_id = public.current_account_id()));

-- Global templates: any signed-in user may read
create policy "auth read" on public.badges
  for select to authenticated using (true);
create policy "auth read" on public.library_resources
  for select to authenticated using (true);
