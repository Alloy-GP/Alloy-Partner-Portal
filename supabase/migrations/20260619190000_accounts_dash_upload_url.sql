-- Per-brand Dash guest-upload link. Powers the "Upload Assets" sidebar button so a
-- client uploads straight into their own brand folder (no Dash login). Set per account
-- from the link created in Dash Admin > Guest upload links. Falls back to the shared
-- DAM URL in the UI when null.
alter table public.accounts add column if not exists dash_upload_url text;
