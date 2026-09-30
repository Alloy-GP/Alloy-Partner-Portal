-- Engagement proposals · Alloy's own proposal to a NEW client, delivered inside
-- the portal (NOT the CMGT board-proposal system — that is `proposals`).
--
-- Until the client's owner accepts, the portal is LOCKED to the proposal page
-- (App.jsx → ProposalGate; decision in src/lib/engagementGate.js). Staff author
-- it in Admin → client → Engagement proposal. Content is the evergreen module
-- catalog (src/lib/engagementCatalog.js) switched on per client and scaled by
-- the number of locations they manage, plus reference links (view.alloygp.co).
--
-- Lifecycle: draft → sent → accepted, or withdrawn at any point. One live
-- (non-withdrawn) proposal per account. Only 'sent' locks the portal; 'accepted'
-- keeps the doc readable; 'draft' is invisible to clients (RLS below).
--
-- Writes: staff via RLS (same pattern as guides). The client's acceptance and
-- change requests go through the `engagement-proposal` edge function (service
-- role) so the acceptance record (who / when / which wording) can't be forged
-- and Alloy gets an email. Additive; nothing existing changes.

create table if not exists public.engagement_proposals (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  status            text not null default 'draft'
                    check (status in ('draft','sent','accepted','withdrawn')),
  title             text not null default '',
  intro             text not null default '',
  closing           text not null default '',
  locations_count   integer not null default 1 check (locations_count >= 1),
  modules           text[] not null default '{}',          -- engagementCatalog keys switched on
  monthly_amount    numeric(14,2),
  setup_amount      numeric(14,2),
  start_date        date,
  term_months       integer,
  reference_links   jsonb not null default '[]'::jsonb,    -- [{label, url}]
  version           integer not null default 1,            -- bumps on every re-send
  sent_at           timestamptz,
  sent_by           uuid,
  accepted_at       timestamptz,
  accepted_by       uuid,                                  -- auth.users id of the accepting owner
  accepted_name     text,
  accepted_title    text,
  accepted_version  integer,                               -- the version they accepted
  agreement_version text,                                  -- wording they agreed to (PROPOSAL_AGREEMENT_VERSION)
  change_requests   jsonb not null default '[]'::jsonb,    -- [{at, by, name, message}]
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists engagement_proposals_account_idx
  on public.engagement_proposals (account_id, created_at desc);

-- One live proposal per account; a withdrawn one can be replaced.
create unique index if not exists engagement_proposals_one_live
  on public.engagement_proposals (account_id) where status <> 'withdrawn';

alter table public.engagement_proposals enable row level security;

-- Read: clients see their own account's SENT or ACCEPTED proposal (never a
-- draft in progress); staff see every account's.
drop policy if exists engagement_proposals_select on public.engagement_proposals;
create policy engagement_proposals_select on public.engagement_proposals
  for select to authenticated
  using (public.is_staff()
         or (account_id = public.current_account_id() and status in ('sent','accepted')));

-- Write: staff only (Admin). Client-side state changes go through the edge fn.
drop policy if exists engagement_proposals_insert on public.engagement_proposals;
create policy engagement_proposals_insert on public.engagement_proposals
  for insert to authenticated with check (public.is_staff());
drop policy if exists engagement_proposals_update on public.engagement_proposals;
create policy engagement_proposals_update on public.engagement_proposals
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists engagement_proposals_delete on public.engagement_proposals;
create policy engagement_proposals_delete on public.engagement_proposals
  for delete to authenticated using (public.is_staff());

drop trigger if exists engagement_proposals_touch on public.engagement_proposals;
create trigger engagement_proposals_touch
  before update on public.engagement_proposals
  for each row execute function public.proposal_uvps_set_updated_at();

-- Live: a client's portal locks/unlocks the moment staff send or withdraw, and
-- staff see an acceptance land without a refresh (AuthGate's realtime channel).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'engagement_proposals'
  ) then
    alter publication supabase_realtime add table public.engagement_proposals;
  end if;
end $$;
