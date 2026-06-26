-- Proposal system · the pipeline (one row per proposal).
--
-- Self-contained submission identity + pipeline state. A proposal links to a
-- WhatConverts lead via `lead_key` (the wc_lead_id once leads are wired; the
-- demo board ids for now), but carries its own submission snapshot so it does
-- NOT depend on the real `leads` table — which lets the demo run and keeps the
-- proposal stable after send (it shouldn't mutate when the source lead does).
--
-- The match %, per-concern prose, sections, and pricing are DERIVED at load
-- (src/lib/proposalMockData.js enrichLead), not stored — so this table stays
-- lean and the cockpit renders DB rows identically to the mock pipeline.
-- Account-scoped + RLS, mirroring proposal_uvps. Telemetry (Close opens/scroll)
-- will be a separate proposal_events table (the anonymous-write seam).

create table if not exists public.proposals (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  lead_key        text not null,                 -- wc_lead_id later; demo id now
  sort            integer not null default 0,
  -- submission identity (denormalized; comes from the WhatConverts lead later)
  community       text not null default '',
  contact         text not null default '',
  contact_role    text not null default '',
  first_name      text not null default '',
  city            text not null default '',
  homes           integer not null default 0,
  email           text not null default '',
  phone           text not null default '',
  meta_type       text not null default '',
  meta_status     text not null default '',
  dues            text not null default '',
  engage_timeline text not null default '',
  budget          text not null default '',
  quote           text not null default '',
  received        text not null default '',       -- display label for now
  -- pipeline state
  status          text not null default 'new',    -- new | review | sent | won | lost
  priority        boolean not null default false,
  disq            boolean not null default false,
  disq_reason     text not null default '',
  owner           text not null default '',
  link_expires    text not null default '',
  -- proposal config
  selected_pains  text[] not null default '{}',
  tier_id         text not null default 'full',
  per_home        numeric not null default 0,
  quote_value     integer,                        -- optional override; else derived
  notes           jsonb not null default '[]',    -- Close internal notes
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id, lead_key)
);

create index if not exists proposals_account_sort_idx
  on public.proposals (account_id, sort);

alter table public.proposals enable row level security;

create policy proposals_select on public.proposals
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

create policy proposals_insert on public.proposals
  for insert to authenticated
  with check (account_id = public.current_account_id() or public.is_staff());

create policy proposals_update on public.proposals
  for update to authenticated
  using (account_id = public.current_account_id() or public.is_staff())
  with check (account_id = public.current_account_id() or public.is_staff());

create policy proposals_delete on public.proposals
  for delete to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Reuse the proposal updated_at trigger function (generic: sets updated_at=now()).
drop trigger if exists proposals_touch on public.proposals;
create trigger proposals_touch
  before update on public.proposals
  for each row execute function public.proposal_uvps_set_updated_at();
