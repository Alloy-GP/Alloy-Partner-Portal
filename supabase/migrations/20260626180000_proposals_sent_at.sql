-- Proposal system · when the proposal was sent to the board. Powers Close's
-- real link-expiry / recency math (vs the mock labels). Additive, nullable.
-- Backfill the already-"sent" demo boards with plausible recent timestamps.
alter table public.proposals
  add column if not exists sent_at timestamptz;

update public.proposals p
set sent_at = now() - (interval '1 day' * v.days_ago)
from (values ('OAK-2026-LA61', 6), ('PEC-2026-LA08', 8), ('SEA-2026-MS22', 7)) as v(lead_key, days_ago)
where p.lead_key = v.lead_key
  and p.account_id = (select id from public.accounts where short_name = 'CMGT')
  and p.sent_at is null;
