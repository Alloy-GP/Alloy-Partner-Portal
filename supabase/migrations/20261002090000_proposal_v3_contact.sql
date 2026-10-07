-- Proposal page v3 (design handoff Oct 1 2026): the cover shows who to reach
-- ("Questions? Text, call or email …") and the Next steps headline is seasonal
-- copy staff can override per proposal. Additive; existing rows unaffected.
alter table public.engagement_proposals
  add column if not exists prepared_by_phone text,
  add column if not exists prepared_by_email text,
  add column if not exists next_steps_title text;
