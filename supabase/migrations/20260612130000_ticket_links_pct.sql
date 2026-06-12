-- Tickets now also carry a subtask-based progress % (stages complete ÷ total),
-- pulled from the linked Monday item's subitems. A row may exist for progress
-- even without a review link, so link becomes nullable.
alter table public.ticket_links alter column link drop not null;
alter table public.ticket_links add column if not exists pct integer;
