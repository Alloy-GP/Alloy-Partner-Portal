-- Per-client WhatConverts profile id (like monday_board_id / zendesk_org_id).
alter table public.accounts
  add column if not exists whatconverts_profile_id text;
