-- Track the real WhatConverts quotable state so "Not a fit" (no) is distinct
-- from "needs triage" (not_set / pending). quality stays for back-compat.
alter table leads add column if not exists quotable text;   -- yes | no | pending | not_set
update leads set quotable = case when quality = 'qualified' then 'yes' else 'not_set' end
  where quotable is null;
