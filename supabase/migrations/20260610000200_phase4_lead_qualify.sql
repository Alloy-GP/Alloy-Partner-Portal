-- Lead qualification: map each row back to its WhatConverts lead for write-back,
-- and split value into quote (open opportunity) vs sales (closed/won, annual).
alter table leads add column if not exists wc_lead_id  text;
alter table leads add column if not exists quote_value numeric;   -- quoted, not closed
alter table leads add column if not exists sales_value numeric;   -- closed deal, ANNUAL
create index if not exists leads_account_wc_lead on leads(account_id, wc_lead_id);
