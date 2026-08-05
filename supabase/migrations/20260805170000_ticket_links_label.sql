-- Ticket links · carry the Monday link column's "text to display" so the ticket
-- card's review button shows that label instead of a hardcoded "Review Now".
alter table public.ticket_links add column if not exists label text;
comment on column public.ticket_links.label is 'Monday link column "text to display" — used as the ticket card button label (falls back to "Review Now").';
