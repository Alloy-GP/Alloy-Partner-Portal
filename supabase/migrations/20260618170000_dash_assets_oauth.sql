-- Dash DAM as the assets source of truth (replaces the Monday Assets board path).
--   - accounts.dash_folder_id : the brand's top-level Dash folder (1 folder = 1 account).
--     sync-dash-assets reads this folder's category subfolders -> public.assets.
--   - dash_oauth : single-row OAuth store. Dash has NO client-credentials grant, so we
--     run the Authorization Code Flow once (scope offline_access) to get a refresh token,
--     then exchange it for access tokens at https://login.dash.app/oauth/token per run.
--     Refresh token ROTATES on every refresh -> stored mutably (an env secret can't be
--     rewritten per-run). Mirrors public.quickbooks_oauth. RLS on, NO policies: only the
--     service role (edge functions) may ever read/write it.

alter table public.accounts add column if not exists dash_folder_id text;

-- sync-dash-assets upserts on (account_id, dash_asset_id). Embeddable links are stable
-- + minted via async batch jobs, so we keep the existing download/thumb URLs across syncs
-- (carry forward on upsert) rather than re-minting every run.
alter table public.assets add column if not exists dash_asset_id text;
create unique index if not exists assets_account_dash_asset_idx
  on public.assets (account_id, dash_asset_id) where dash_asset_id is not null;

create table if not exists public.dash_oauth (
  id                       text primary key default 'dash',  -- single row
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  updated_at               timestamptz not null default now()
);
alter table public.dash_oauth enable row level security;
