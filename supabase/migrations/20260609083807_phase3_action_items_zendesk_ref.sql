-- Tie each action item to its Zendesk ticket (from Monday's Zendesk
-- integration column) so the portal can deep-link to the exact ticket.
alter table public.action_items add column if not exists zendesk_id  text;
alter table public.action_items add column if not exists zendesk_url text;
