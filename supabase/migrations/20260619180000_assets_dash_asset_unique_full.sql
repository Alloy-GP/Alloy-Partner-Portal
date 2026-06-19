-- A partial unique index (WHERE dash_asset_id is not null) cannot be used as an
-- ON CONFLICT target, which broke sync-dash-assets' upsert. Replace it with a full
-- unique index. Postgres treats NULLs as distinct, so rows with NULL dash_asset_id
-- (non-Dash sources) still coexist freely; only non-null (account_id, dash_asset_id)
-- pairs are constrained unique.
drop index if exists assets_account_dash_asset_idx;
create unique index if not exists assets_account_dash_asset_idx
  on public.assets (account_id, dash_asset_id);
