-- Cache the public comment count per ticket alongside its AI summary, so the
-- "Waiting on you" cards can show a message count without per-load fetches.
alter table public.ticket_summaries add column if not exists comment_count integer;
