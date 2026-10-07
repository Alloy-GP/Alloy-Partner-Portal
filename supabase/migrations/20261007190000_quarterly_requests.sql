-- Quarterly meeting prep · one row per client per quarterly round.
--
-- The quarterly twin of `newsletter_requests` (20260804120000). Before each
-- quarterly planning meeting an Alloy admin OPENS a round for a hand-picked set
-- of clients (staff-only insert). Each selected client gets a row (status
-- 'open'); a `quarterly`-tagged Zendesk ticket in their portal then shows an
-- "Open Form" button. The client answers five short questions about last
-- quarter + what's ahead; on submit we create a Zendesk ticket (like a New
-- Request) AND stamp the answers here (status -> 'submitted') so staff can track
-- completion in the Admin console and read the answers before the meeting.
-- Admins 'close' a row to archive it once the meeting has happened.
--
-- Additive + namespaced + RLS-gated: dark until an admin opens the first round.
-- Nothing else references it; drop table ... cascade is a clean revert.

create table if not exists public.quarterly_requests (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  title             text not null default '',        -- e.g. "Q4 2026 Quarterly Meeting"
  status            text not null default 'open',     -- open | submitted | closed
  due_date          date,
  -- The client's answers. jsonb so the field set can evolve without a migration:
  -- { wins, misses, changes, priorities, topics, attachments: [name] }
  submission        jsonb,
  zendesk_ticket_id text,
  submitted_at      timestamptz,
  submitted_by      text,                             -- name/email of who submitted
  created_by        uuid,                             -- staff who opened the round
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One live round per client at a time (open or submitted). Closing archives it
  -- and frees the slot for the next round. A partial unique index keeps history.
  constraint quarterly_requests_status_chk check (status in ('open','submitted','closed'))
);

create index if not exists quarterly_requests_account_status_idx
  on public.quarterly_requests (account_id, status);

-- At most one non-closed round per client (prevents a double prompt).
create unique index if not exists quarterly_requests_one_live_idx
  on public.quarterly_requests (account_id)
  where status <> 'closed';

alter table public.quarterly_requests enable row level security;

-- Read: the client sees their own; staff see all. (Powers the prompt + tracker.)
create policy quarterly_requests_select on public.quarterly_requests
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Insert: staff only — admins open a round. (Clients never create their own.)
create policy quarterly_requests_insert on public.quarterly_requests
  for insert to authenticated
  with check (public.is_staff());

-- Update: the client submits their own row; staff may update any (open/close).
create policy quarterly_requests_update on public.quarterly_requests
  for update to authenticated
  using (account_id = public.current_account_id() or public.is_staff())
  with check (account_id = public.current_account_id() or public.is_staff());

-- Delete: staff only.
create policy quarterly_requests_delete on public.quarterly_requests
  for delete to authenticated
  using (public.is_staff());

-- Reuse the generic updated_at trigger fn (sets updated_at = now()).
drop trigger if exists quarterly_requests_touch on public.quarterly_requests;
create trigger quarterly_requests_touch
  before update on public.quarterly_requests
  for each row execute function public.proposal_uvps_set_updated_at();
