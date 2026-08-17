-- Make one-lead-one-client a DATABASE FACT, not an application convention.
--
-- THE GAP. proposals got a global partial unique index in 20260814180000
-- (proposals_wc_lead_key_unique on lead_key where source='whatconverts'), so one
-- WhatConverts lead can back at most one proposal portal-wide. `leads` never got
-- the equivalent: its only unique index is
--     leads_account_wc_lead_uk (account_id, wc_lead_id)
-- which PERMITS the same wc_lead_id on two different accounts. That is precisely
-- the shape of the incident: WC account 116805 was claimed by CMGT, Tidewater's
-- leads were ingested under CMGT, and nothing in the schema objected.
--
-- Audited immediately before writing this:
--   * 0 wc_lead_id values sit on more than one account
--   * 0 WhatConverts account ids are claimed by more than one portal account
-- so both constraints below are satisfied by current data and will not fail.

-- ── 1. a WhatConverts lead belongs to exactly ONE portal account ─────────────
-- Partial so historical rows with a null wc_lead_id (non-WhatConverts leads) are
-- unaffected; Postgres treats NULLs as distinct anyway, but being explicit keeps
-- the intent readable.
create unique index if not exists leads_wc_lead_id_global_unique
  on public.leads (wc_lead_id)
  where wc_lead_id is not null;

comment on index public.leads_wc_lead_id_global_unique is
  'One WhatConverts lead may exist on exactly one portal account. leads_account_wc_lead_uk (account_id, wc_lead_id) permitted the same lead on two accounts, which is how Tidewater leads were once ingested under CMGT. sync-whatconverts claims a lead (deletes any other account''s row for that wc_lead_id) before upserting, so a legitimately reassigned WhatConverts account still syncs.';

-- ── 2. close the source-column dodge on the proposal tenancy trigger ─────────
-- assert_proposal_lead_tenancy() returns early unless source = 'whatconverts', so
-- a row inserted with source NULL or 'seed' skipped the ownership check entirely
-- while still carrying a real WhatConverts lead_key. WhatConverts lead_ids are
-- all-numeric (verified 19/19 when proposals.source was backfilled), so a numeric
-- lead_key is treated as WhatConverts-derived regardless of what source claims.
create or replace function public.assert_proposal_lead_tenancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_account uuid;
  owner_name    text;
  looks_synced  boolean;
begin
  -- Either it says it came from WhatConverts, or its lead_key is shaped like a
  -- WhatConverts lead id. Claiming 'seed' must not buy an exemption.
  looks_synced := coalesce(new.source, '') = 'whatconverts'
                  or new.lead_key ~ '^[0-9]+$';
  if not looks_synced then
    return new;
  end if;

  -- Identity unchanged on an UPDATE → nothing to re-check. This is what keeps a
  -- proposal editable and archivable after its lead is legitimately pruned.
  if tg_op = 'UPDATE'
     and new.account_id = old.account_id
     and new.lead_key   = old.lead_key then
    return new;
  end if;

  select l.account_id into owner_account
    from public.leads l
   where l.wc_lead_id = new.lead_key
   limit 1;

  -- No lead row anywhere: ownership cannot be proven either way. Allow it — the
  -- drain mints from a lead it has just read, and refusing here would break
  -- re-inserting a proposal whose lead has since been pruned.
  if owner_account is null then
    return new;
  end if;

  if owner_account <> new.account_id then
    select coalesce(short_name, company) into owner_name from public.accounts where id = owner_account;
    raise exception
      'Proposal for lead % belongs to account % (%), not %. Refusing to create another client''s proposal.',
      new.lead_key, owner_account, coalesce(owner_name, '?'), new.account_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── 3. a lead may not be moved to another account by a stray UPDATE ──────────
-- The global unique above stops a DUPLICATE, but not a lead being reassigned
-- wholesale. Only the sync should ever change a lead's account, and it does so by
-- delete-then-insert (claim), never by UPDATE. Anything updating account_id in
-- place is a bug or a mistake, so refuse it outright.
create or replace function public.assert_lead_account_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.account_id <> old.account_id then
    raise exception
      'A lead cannot be moved between accounts by UPDATE (lead % : % -> %). Re-sync instead; sync-whatconverts claims a lead by delete-then-insert.',
      coalesce(new.wc_lead_id, old.wc_lead_id), old.account_id, new.account_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_account_immutable on public.leads;
create trigger leads_account_immutable
  before update of account_id on public.leads
  for each row execute function public.assert_lead_account_immutable();
