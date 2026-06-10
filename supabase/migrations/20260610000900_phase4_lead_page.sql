-- The page the form/widget was on (shown in the lead-detail panel).
alter table leads add column if not exists page text;
