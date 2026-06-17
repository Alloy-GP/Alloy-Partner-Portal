-- Pin the Monday "Ongoing Services/Projects" group by ID per client (group IDs
-- are unique per board). sync-monday uses this when set; otherwise it falls back
-- to matching any group whose title starts with "Ongoing". Robust to renames.
alter table public.accounts add column if not exists monday_service_group_id text;
