-- Lifetime WhatConverts tenure stats, refreshed by the weekly rollup.
alter table accounts add column if not exists wc_first_lead_at      timestamptz;
alter table accounts add column if not exists wc_qualified_total    int;
alter table accounts add column if not exists wc_qualified_by_source jsonb;
alter table accounts add column if not exists wc_rollup_at          timestamptz;
