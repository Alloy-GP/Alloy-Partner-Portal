-- Proposal system · the anonymous board-write telemetry seam (Close analytics).
--
-- board_token: each proposal's magic-link secret. The anonymous board surface
-- identifies itself by THIS (never the guessable lead_key). The proposal-track
-- edge function (service role) validates it before recording any event.
alter table public.proposals add column if not exists board_token text;
update public.proposals
  set board_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where board_token is null;
alter table public.proposals alter column board_token set not null;
alter table public.proposals
  alter column board_token set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index if not exists proposals_board_token_idx on public.proposals (board_token);

-- proposal_events: append-only engagement telemetry (opens, section views, dwell,
-- CTA clicks). Written ONLY by the proposal-track edge fn via the service role,
-- gated by board_token — there is deliberately NO insert/update/delete policy,
-- so neither anon nor authenticated clients can write directly. The owning
-- account + staff may READ (the cockpit Close view aggregates these).
create table if not exists public.proposal_events (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  viewer_key   text not null default '',     -- anonymous per-device fingerprint
  viewer_name  text not null default '',     -- optional; UI falls back to "Board member #N"
  event_type   text not null,                -- open | section | heartbeat | cta
  section_name text not null default '',
  pct          integer not null default 0,   -- scroll/read depth for a section
  ms           integer not null default 0,   -- dwell for this event
  created_at   timestamptz not null default now()
);
create index if not exists proposal_events_proposal_idx on public.proposal_events (proposal_id, created_at);
create index if not exists proposal_events_account_idx on public.proposal_events (account_id, created_at);

alter table public.proposal_events enable row level security;

-- READ only (cockpit). No write policy → only the service-role function writes.
create policy proposal_events_select on public.proposal_events
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());
