-- Guides · trigger tag. A guide can declare a Zendesk ticket tag; any ticket
-- carrying that tag shows the guide as a button on its card (e.g. the global
-- "how to record" guide surfaces on tickets tagged `video`). Keeps guides inside
-- the ticket flow — no separate nav, no per-ticket linking.
alter table public.guides add column if not exists tag text;
comment on column public.guides.tag is 'Zendesk ticket tag that surfaces this guide as a button on matching ticket cards (e.g. video).';
