-- Quarterly rounds · the meeting itself, once booked.
--
-- "Schedule the meeting" (Cal.com dialog) used to stay on the ticket after the
-- client booked, because nothing told the portal. Cal's embed fires a
-- bookingSuccessful event in the page; the client writes it here (their own
-- row, under RLS) and the button becomes "Meeting booked · <date>" — on the
-- ticket, in the form's success step, and as a chip in the Admin tracker.
--   meeting_at    start of the booked meeting
--   meeting_uid   Cal.com booking uid (for a future cancel/reschedule webhook)
--   meeting_meta  { title, end_time, video_call_url, source: 'embed', booked_at }
-- Null = not booked (or booked outside the portal — a webhook would close that gap).

alter table public.quarterly_requests
  add column if not exists meeting_at   timestamptz,
  add column if not exists meeting_uid  text,
  add column if not exists meeting_meta jsonb;

comment on column public.quarterly_requests.meeting_at is 'Start of the Cal.com meeting the client booked from the portal; null = not booked here.';
