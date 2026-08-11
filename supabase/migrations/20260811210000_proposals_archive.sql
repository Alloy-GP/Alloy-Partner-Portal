-- Proposal system · archive / delete a lead out of the pipeline.
--
-- WHY NOT A HARD DELETE. The inbox auto-drains `leads` into `proposals` on open
-- and every 3 minutes (see src/lib/intakeDrain.js). It decides what's new by
-- "has no proposal row yet". So `delete from proposals` makes a lead un-minted
-- again and the very next drain re-creates it — and re-runs its LLM match, at
-- cost. Spam would resurrect itself on a loop, roughly every 3 minutes, forever.
--
-- So an archived lead keeps its row as a TOMBSTONE: it is the thing that tells
-- the drain "already handled, never mint again". Every pipeline view filters
-- archived_at is null, so from the cockpit it is gone — and it stays recoverable
-- from the Archive bin, which a real delete would not be.
--
-- Distinct from `disq` (not quotable): disqualified leads are real prospects that
-- didn't fit and belong in Won/Lost as a record. Archived leads are spam,
-- duplicates and test submissions that should not appear anywhere.

alter table public.proposals
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text,
  add column if not exists archived_by     text;

comment on column public.proposals.archived_at is
  'Soft-delete tombstone. Non-null = hidden from every pipeline view AND suppressed from the intake auto-drain so it is never re-minted. Never hard-delete a proposal that came from a lead; it will come straight back.';

-- The pipeline read (every cockpit load) only wants live rows.
create index if not exists proposals_active_idx
  on public.proposals (account_id, sort) where archived_at is null;

-- The Archive bin lists newest-first.
create index if not exists proposals_archived_idx
  on public.proposals (account_id, archived_at desc) where archived_at is not null;
