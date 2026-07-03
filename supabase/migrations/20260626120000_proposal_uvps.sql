-- Proposal system · per-CAM UVP library (the matcher's backbone).
--
-- Each row is one reusable value proposition / capability a CAM matches a
-- board's pain points against. Account-scoped + RLS, mirroring the portal's
-- existing per-account tables (same current_account_id()/is_staff() helpers).
--
-- `position` is the CANONICAL CAP INDEX. The matcher's concern `caps`/`links`
-- are positions into this list ordered by `position`, so it must stay dense
-- and stable: append + retire (active=false) only — never reorder, never
-- hard-delete a position that proposals reference.
--
-- This is the first proposal_* table. It is purely additive: no existing
-- portal code or table references it, so it cannot affect current behavior,
-- and it is trivially reversible (drop table proposal_uvps cascade).

create table if not exists public.proposal_uvps (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  position    integer not null,                 -- canonical cap index (0-based, dense)
  slug        text not null,                    -- stable string id (e.g. 'pod')
  title       text not null,
  short       text not null default '',
  body        text not null default '',
  icon        text not null default 'sparkles',
  category    text not null default 'operations',
  tags        text[] not null default '{}',
  proof_value text not null default '',
  proof_label text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, slug),
  unique (account_id, position)
);

create index if not exists proposal_uvps_account_position_idx
  on public.proposal_uvps (account_id, position);

alter table public.proposal_uvps enable row level security;

-- Read: own account, or any account for staff (matches the /c/:id staff prefix).
create policy proposal_uvps_select on public.proposal_uvps
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Write: the client operates its own UVP library; staff may edit any account's.
create policy proposal_uvps_insert on public.proposal_uvps
  for insert to authenticated
  with check (account_id = public.current_account_id() or public.is_staff());

create policy proposal_uvps_update on public.proposal_uvps
  for update to authenticated
  using (account_id = public.current_account_id() or public.is_staff())
  with check (account_id = public.current_account_id() or public.is_staff());

create policy proposal_uvps_delete on public.proposal_uvps
  for delete to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Keep updated_at fresh on edit (uniquely named to avoid colliding with any
-- existing trigger function in the portal schema).
create or replace function public.proposal_uvps_set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists proposal_uvps_touch on public.proposal_uvps;
create trigger proposal_uvps_touch
  before update on public.proposal_uvps
  for each row execute function public.proposal_uvps_set_updated_at();
