-- Assets = finished deliverables Alloy has made for a client (logos, email
-- signatures, print/direct-mail, social templates, sales collateral, events).
-- One row per asset, synced from the client's Monday "Assets" board.
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  monday_item_id text,
  name text not null,
  note text,
  category text,            -- section grouping: "Logos & Brand", "Email", ...
  format text,              -- primary format chip on the thumb (SVG/PDF/PNG/HTML)
  formats text[],           -- full format list shown in meta (SVG · PNG · EPS)
  spec text,                -- dimension/variant note (Vector, 512×512, 6×9 in)
  file_count int,           -- number of files bundled
  updated_label text,       -- "Feb 2026" — human month/year last updated
  thumb_url text,           -- optional preview image
  download_url text,        -- file/link to grab the asset
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists assets_account_id_idx on public.assets(account_id);
create unique index if not exists assets_account_monday_item_uidx
  on public.assets(account_id, monday_item_id) where monday_item_id is not null;

alter table public.assets enable row level security;
create policy "acct read" on public.assets
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.assets
  for select to authenticated using (public.is_staff());

-- Per-client Monday "Assets" board (one board <-> one account, like roadmap).
alter table public.accounts add column if not exists monday_assets_board_id text;
