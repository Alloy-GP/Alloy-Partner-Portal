-- Full multi-touch customer journey (WhatConverts customer_journey): the
-- visitor's sessions/sources and pages viewed before converting.
alter table leads add column if not exists journey jsonb;
