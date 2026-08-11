-- Proposal system · when the intake lead was actually RECEIVED.
--
-- THE BUG: the New inbox rendered "Arrived <relative>" from proposals.created_at
-- — the moment a SYNC minted the row, not when the board submitted the form. A
-- backlog sync mints weeks of leads in one minute, so every card read "Arrived
-- just now". Observed on live data before this migration: leads whose true
-- submission times spanned Jul 7 → Aug 11 were all minted within 60 seconds,
-- i.e. a 35-day-old lead was indistinguishable from one that landed that hour.
--
-- received_at carries the real submission time so the cockpit can show a true
-- timestamp AND a real age, both computed at render time (never a stored label).
--
-- Nullable on purpose: the client keeps a fallback chain (received_at → the
-- legacy `received` display string → created_at), so nothing breaks if a future
-- writer forgets to set it. See src/lib/leadAge.js.

alter table public.proposals add column if not exists received_at timestamptz;

comment on column public.proposals.received_at is
  'True intake submission time (from the originating leads row). NOT created_at, which is when a sync minted this proposal.';

-- 1) Authoritative backfill — join the originating WhatConverts leads row.
--    This is exact: leads.created_at comes from WhatConverts date_created.
update public.proposals p
   set received_at = l.created_at
  from public.leads l
 where l.wc_lead_id = p.lead_key
   and l.account_id = p.account_id
   and p.received_at is null;

-- 2) Seeded/demo rows have no leads row. Recover from the human `received`
--    string, whose date/time separator varies by which writer produced it:
--    " · " (mock pipeline), " at " (live intake), " * " (reset-demo seeder).
--    These are naive local times, so they resolve in the DB timezone — fine for
--    demo data, and step 1 already handled every real lead exactly.
--    pg_input_is_valid (PG16+) guards the cast so an unparseable string is
--    skipped rather than aborting the migration.
update public.proposals p
   set received_at = s.norm::timestamp
  from (
    select id,
           replace(replace(replace(received, ' · ', ' '), ' at ', ' '), ' * ', ' ') as norm
      from public.proposals
     where received_at is null
       and coalesce(received, '') <> ''
  ) s
 where s.id = p.id
   and pg_input_is_valid(s.norm, 'timestamp');

-- 3) Last resort for rows with neither a leads row nor parseable text: the
--    row's own created_at, which is what the UI used to use for everything.
update public.proposals
   set received_at = created_at
 where received_at is null;

-- The inbox sorts/filters by arrival age per account.
create index if not exists proposals_received_at_idx
  on public.proposals (account_id, received_at desc);
