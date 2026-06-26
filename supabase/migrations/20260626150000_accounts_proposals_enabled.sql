-- Proposal system · per-account on/off (decision 1: Partnership ↔ Proposals is
-- a per-client lens over the same WhatConverts leads). Additive boolean,
-- default false, so existing accounts are unaffected. CMGT is the pilot.
alter table public.accounts
  add column if not exists proposals_enabled boolean not null default false;

update public.accounts set proposals_enabled = true where short_name = 'CMGT';
