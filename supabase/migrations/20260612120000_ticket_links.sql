-- Maps a Zendesk ticket id -> the Monday item's "Link" column (Pastel/review
-- URL). Populated by sync-monday from the Tickets group. The Projects page
-- "Open review" button reads this for each pending/open ticket.
create table if not exists public.ticket_links (
  account_id uuid not null references public.accounts(id) on delete cascade,
  zendesk_id text not null,
  link text not null,
  primary key (account_id, zendesk_id)
);
alter table public.ticket_links enable row level security;
create index if not exists ticket_links_account_idx on public.ticket_links(account_id);

-- Account-scoped read (clients their own; staff all) — mirrors the other read tables.
create policy "acct read ticket_links" on public.ticket_links
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());
