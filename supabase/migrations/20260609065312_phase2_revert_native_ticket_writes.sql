-- Tickets are sourced from Zendesk (source of truth), not authored in the
-- portal. Remove the native write model; `tickets` stays a read-only cache
-- that a Zendesk sync will populate (service role, bypasses RLS).
drop table if exists public.ticket_messages cascade;

drop policy if exists "acct insert" on public.tickets;
drop policy if exists "acct update" on public.tickets;

alter table public.tickets alter column code       drop default;
alter table public.tickets alter column account_id drop default;
alter table public.tickets alter column status     drop default;
alter table public.tickets alter column priority   drop default;

drop sequence if exists public.ticket_code_seq;
