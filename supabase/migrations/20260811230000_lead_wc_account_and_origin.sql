-- Which WhatConverts profile did this lead come from, and where did this
-- proposal originate? Plus a hard guard against cross-client lead bleed.
--
-- 1. leads.wc_account_id — a client can span several WhatConverts accounts
--    (accounts.whatconverts_profile_id is comma-separated: CMGT has three). The
--    sync fetched each account and merged them, then THREW AWAY which one each
--    lead came from, so the portal could not answer "which profile is this?".
--
-- 2. accounts_wc_account_unique — the gating requirement. Lead isolation rests
--    entirely on one WhatConverts account belonging to exactly one portal
--    account: the sync writes account_id from whichever portal account claimed
--    that WC id, and RLS then scopes reads to current_account_id(). If two
--    portal accounts ever listed the same WC id, both would ingest the same
--    leads and each client would see the other's. That was previously enforced
--    by nothing but care. Now the database refuses it.
--    (Audited before adding: no overlap existed across the 8 configured
--    accounts, so this constraint is satisfied by current data.)
--
-- 3. proposals.source — 'whatconverts' | 'seed'. Needed to tell "the lead was
--    deleted upstream" from "this row never came from WhatConverts at all".
--    Without it the only available signal is "has no leads row", which is true
--    for every seeded demo proposal too — using that to auto-archive would have
--    wiped 14 legitimate rows including 7 sent ones with board engagement.
--    Backfilled from lead_key shape: WhatConverts lead_ids are all-numeric
--    (verified 19/19 synced rows), seeded keys are slugs like 'OAK-2026-LA61'.

-- ── 1. which WhatConverts account a lead came from ────────────────────────────
alter table public.leads add column if not exists wc_account_id text;

comment on column public.leads.wc_account_id is
  'The WhatConverts account_id this lead was fetched from. A portal account may span several (accounts.whatconverts_profile_id is comma-separated).';

create index if not exists leads_wc_account_idx on public.leads (account_id, wc_account_id);

-- ── 2. one WhatConverts account belongs to exactly one portal account ─────────
-- Enforced with a trigger rather than a unique index: whatconverts_profile_id is
-- a comma-separated text column, so the ids have to be unnested to be compared.
create or replace function public.assert_wc_accounts_unclaimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash text;
begin
  select string_agg(distinct x.wc_id || ' (already on ' || x.company || ')', ', ')
    into clash
    from (
      select btrim(t) as wc_id, a.company
        from public.accounts a,
             unnest(string_to_array(coalesce(a.whatconverts_profile_id, ''), ',')) t
       where a.id <> new.id
         and btrim(t) <> ''
         and btrim(t) in (
           select btrim(t2)
             from unnest(string_to_array(coalesce(new.whatconverts_profile_id, ''), ',')) t2
            where btrim(t2) <> ''
         )
    ) x;

  if clash is not null then
    raise exception
      'WhatConverts account already claimed by another portal account: %. Sharing one would cross-feed leads between clients.', clash
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_wc_account_unique on public.accounts;
create trigger accounts_wc_account_unique
  before insert or update of whatconverts_profile_id on public.accounts
  for each row execute function public.assert_wc_accounts_unclaimed();

-- ── 3. proposal origin ────────────────────────────────────────────────────────
alter table public.proposals add column if not exists source text;

comment on column public.proposals.source is
  $c$'whatconverts' = minted from a synced lead, so a missing leads row means it was deleted upstream and the proposal should be archived. 'seed' = demo//seeded row that never had a lead; NULL is treated as not-WhatConverts, i.e. never auto-archived.$c$;

update public.proposals
   set source = case when lead_key ~ '^[0-9]+$' then 'whatconverts' else 'seed' end
 where source is null;

create index if not exists proposals_source_idx on public.proposals (account_id, source);
