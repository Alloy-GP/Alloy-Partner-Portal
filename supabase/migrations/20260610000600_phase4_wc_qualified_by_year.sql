-- Per-year qualified breakdown so prior years (2025, 2024…) live alongside YTD.
alter table accounts add column if not exists wc_qualified_by_year jsonb;
