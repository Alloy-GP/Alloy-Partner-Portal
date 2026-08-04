-- Newsletter intake · one row per client per newsletter round.
--
-- An Alloy admin OPENS a round for a hand-picked set of clients (staff-only
-- insert). Each selected client gets a row (status 'open'), which surfaces as a
-- banner on every page of their portal. The client fills a short form; on submit
-- we create a Zendesk ticket (like a New Request) AND stamp the answers here
-- (status -> 'submitted') so staff can track completion in the Admin console.
-- Admins can 'close' a row to archive it once handled.
--
-- Additive + namespaced + RLS-gated (mirrors `proposals`): dark until an admin
-- opens the first round. Nothing else references it; drop table ... cascade is a
-- clean revert.

create table if not exists public.newsletter_requests (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  title             text not null default '',        -- e.g. "August 2026 Newsletter"
  status            text not null default 'open',     -- open | submitted | closed
  due_date          date,
  -- The client's answers. jsonb so the field set can evolve without a migration:
  -- { highlights, feature, cta, links: [{label, url}], notes }
  submission        jsonb,
  zendesk_ticket_id text,
  submitted_at      timestamptz,
  submitted_by      text,                             -- name/email of who submitted
  created_by        uuid,                             -- staff who opened the round
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One live round per client at a time (open or submitted). Closing archives it
  -- and frees the slot for the next round. A partial unique index keeps history.
  constraint newsletter_requests_status_chk check (status in ('open','submitted','closed'))
);

create index if not exists newsletter_requests_account_status_idx
  on public.newsletter_requests (account_id, status);

-- At most one non-closed round per client (prevents a double-open banner).
create unique index if not exists newsletter_requests_one_live_idx
  on public.newsletter_requests (account_id)
  where status <> 'closed';

alter table public.newsletter_requests enable row level security;

-- Read: the client sees their own; staff see all. (Powers the banner + tracker.)
create policy newsletter_requests_select on public.newsletter_requests
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Insert: staff only — admins open a round. (Clients never create their own.)
create policy newsletter_requests_insert on public.newsletter_requests
  for insert to authenticated
  with check (public.is_staff());

-- Update: the client submits their own row; staff may update any (open/close).
create policy newsletter_requests_update on public.newsletter_requests
  for update to authenticated
  using (account_id = public.current_account_id() or public.is_staff())
  with check (account_id = public.current_account_id() or public.is_staff());

-- Delete: staff only.
create policy newsletter_requests_delete on public.newsletter_requests
  for delete to authenticated
  using (public.is_staff());

-- Reuse the generic updated_at trigger fn (sets updated_at = now()).
drop trigger if exists newsletter_requests_touch on public.newsletter_requests;
create trigger newsletter_requests_touch
  before update on public.newsletter_requests
  for each row execute function public.proposal_uvps_set_updated_at();
