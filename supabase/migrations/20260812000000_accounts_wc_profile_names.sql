-- Human names for a client's WhatConverts profiles.
--
-- leads.wc_account_id records WHICH profile a lead came from, but as a bare id
-- ("115145"), which tells a staffer nothing. WhatConverts has the names (CMGT vs
-- CMGT Landing) and this portal cannot read them: the API credentials live in
-- Supabase secrets, whose values the Management API only returns as SHA-256
-- digests, so nothing outside the edge runtime can authenticate to WhatConverts.
-- Until the sync learns to fetch them, the mapping is stored here.
--
-- Keyed by WhatConverts account_id, scoped per portal account. That's safe now
-- that accounts_wc_account_unique guarantees one WC account belongs to exactly
-- one portal account. Unknown ids fall back to showing the raw id, so a missing
-- entry degrades to today's behaviour rather than blanking the field.

alter table public.accounts
  add column if not exists wc_profile_names jsonb not null default '{}'::jsonb;

comment on column public.accounts.wc_profile_names is
  'WhatConverts account_id -> display name, e.g. {"116235":"CMGT","115145":"CMGT Landing"}. Used to label leads.wc_account_id. Unknown ids fall back to the raw id.';

-- Known names (from the WhatConverts account list).
update public.accounts
   set wc_profile_names = wc_profile_names || '{"116235":"CMGT","115145":"CMGT Landing"}'::jsonb
 where short_name = 'CMGT';
