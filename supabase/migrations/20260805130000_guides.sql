-- Guides · self-contained HTML guide documents shown on the client Guides page.
--
-- Two scopes: GLOBAL (account_id null → every client sees it, e.g. the Alloy
-- "How to record Q&A clips" guide) and CLIENT-OWNED (account_id set → only that
-- client, e.g. Edison's per-clip shoot sheets). The `html` column holds the full
-- standalone document (own <head>/<style>); the portal renders it in an isolated
-- <iframe srcdoc> so its CSS never clashes with the app.
--
-- Staff author guides (Admin → Guides); clients only read the ones scoped to
-- them. Additive + RLS-gated, mirroring the other account-scoped tables.

create table if not exists public.guides (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.accounts(id) on delete cascade,  -- null = global
  title       text not null default '',
  description text not null default '',
  category    text not null default '',
  html        text not null default '',
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists guides_account_idx on public.guides (account_id, sort);

alter table public.guides enable row level security;

-- Read: global guides (account_id null) + your own account's + staff see all.
create policy guides_select on public.guides
  for select to authenticated
  using (account_id is null or account_id = public.current_account_id() or public.is_staff());

-- Write: staff only (authored in the Admin dashboard).
create policy guides_insert on public.guides
  for insert to authenticated with check (public.is_staff());
create policy guides_update on public.guides
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy guides_delete on public.guides
  for delete to authenticated using (public.is_staff());

drop trigger if exists guides_touch on public.guides;
create trigger guides_touch
  before update on public.guides
  for each row execute function public.proposal_uvps_set_updated_at();
