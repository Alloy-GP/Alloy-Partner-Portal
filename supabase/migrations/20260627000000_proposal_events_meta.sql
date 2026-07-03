-- Proposal system · structured detail for board responses (request-changes /
-- decline / continue). The event row carries a human label in section_name for
-- the Close feed; `meta` holds the full payload (areas[], specifics, reason,
-- notes, slot, method) so nothing is truncated/lost. Additive, defaults '{}'.
alter table public.proposal_events
  add column if not exists meta jsonb not null default '{}'::jsonb;
