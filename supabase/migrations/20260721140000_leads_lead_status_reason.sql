-- Portal-side disqualification reason for a WhatConverts lead, refining "not a
-- fit" (quotable='no') into 'spam' | 'duplicate' | null. Portal-local: the sync
-- (upsert-and-prune) never writes this column, so it survives every sync.
alter table leads add column if not exists lead_status text;
comment on column leads.lead_status is 'Portal disqualification reason: spam | duplicate | null (only meaningful when quotable=no).';
