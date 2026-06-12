-- AI summaries of Zendesk ticket threads (Zone 1 "Waiting on you" cards).
-- Separate from ticket_links (which the Monday sync rebuilds each run) so the
-- cached summary survives syncs. Re-generated only when the ticket's
-- source_updated_at advances (i.e. when the ticket actually updates).
create table if not exists public.ticket_summaries (
  account_id uuid not null references public.accounts(id) on delete cascade,
  zendesk_id text not null,
  summary text not null,
  source_updated_at timestamptz,
  generated_at timestamptz not null default now(),
  primary key (account_id, zendesk_id)
);
alter table public.ticket_summaries enable row level security;
create policy "acct read ticket_summaries" on public.ticket_summaries
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());
