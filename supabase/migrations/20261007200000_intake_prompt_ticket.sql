-- Intake rounds · the PROMPT ticket, sent from the portal.
--
-- Opening a newsletter / quarterly round used to leave staff to create the
-- client's Zendesk ticket by hand (pending + tagged) so the portal would show
-- the "Open Form" button. Admin now sends that ticket itself when the round is
-- opened (`admin` fn, `<x>_open` with `ticket`): staff pick who it goes to and
-- who it sends as (default Sharlene), and can edit the subject/message.
--
-- `zendesk_ticket_id` stays what it was — the ticket the CLIENT's submission
-- creates. These two columns record the OUTGOING prompt:
--   prompt_ticket_id  the Zendesk ticket id we created when the round opened
--   prompt_meta       { ticket_id, requester_id, requester_name, sender_id,
--                       sender_name, subject, status, tags, sent_at }
-- Null when staff opened the round without sending a ticket, or when the send
-- failed (the response tells them; the round still opens).

alter table public.newsletter_requests
  add column if not exists prompt_ticket_id text,
  add column if not exists prompt_meta jsonb;

alter table public.quarterly_requests
  add column if not exists prompt_ticket_id text,
  add column if not exists prompt_meta jsonb;

comment on column public.newsletter_requests.prompt_ticket_id is 'Zendesk ticket Admin sent to prompt the client (pending, tagged newsletter). Not the submission ticket.';
comment on column public.quarterly_requests.prompt_ticket_id is 'Zendesk ticket Admin sent to prompt the client (pending, tagged quarterly). Not the submission ticket.';
