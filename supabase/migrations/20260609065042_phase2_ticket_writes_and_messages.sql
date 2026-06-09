-- NOTE: This migration added a native ticket-authoring model. It is fully
-- reverted by the next migration (20260609065312) because tickets are sourced
-- from Zendesk. Kept here to match applied history.

-- Auto-generate ticket codes for new client requests (existing seeds keep theirs).
create sequence if not exists public.ticket_code_seq start 4300;
alter table public.tickets alter column code set default ('ZD-' || nextval('public.ticket_code_seq'));

-- Sensible defaults so the client insert only needs title + body + priority.
alter table public.tickets alter column account_id set default public.current_account_id();
alter table public.tickets alter column status     set default 'open';
alter table public.tickets alter column priority   set default 'med';

-- Clients may create tickets and update their own account's tickets (e.g. resolve).
create policy "acct insert" on public.tickets
  for insert to authenticated
  with check (account_id = public.current_account_id());

create policy "acct update" on public.tickets
  for update to authenticated
  using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

-- Thread messages on a ticket.
create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  sender      text not null check (sender in ('client','team')) default 'client',
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on public.ticket_messages(ticket_id);

alter table public.ticket_messages enable row level security;

create policy "acct read" on public.ticket_messages
  for select to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.account_id = public.current_account_id()));

create policy "acct insert" on public.ticket_messages
  for insert to authenticated
  with check (sender = 'client' and exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.account_id = public.current_account_id()));
