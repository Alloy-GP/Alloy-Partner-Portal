-- Per-account Pastel (visual website feedback board) link. When a client picks
-- "Website update / change" in the new-request form, we route them here instead
-- of opening a text ticket (falls back to the ticket form when unset).
alter table public.accounts add column if not exists pastel_url text;
