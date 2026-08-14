-- Make cross-client lead bleed impossible at the DATABASE level.
--
-- WHAT WENT WRONG. Lead isolation rested on one rule enforced only by care:
-- `leads.account_id` is written from whichever portal account claimed that
-- WhatConverts account id. 20260811230000 added a trigger so two portal accounts
-- can't claim the same WC id — but nothing tied a PROPOSAL to the account that
-- owns its lead. So when WC account 116805 moved from CMGT to Tidewater, CMGT's
-- lead rows were correctly pruned while the 19 proposals minted from them stayed
-- behind on CMGT, readable by CMGT's users. Tidewater's prospects, on CMGT's
-- account. Nothing in the schema forbade it.
--
-- Two guarantees, both enforced by Postgres rather than by application care:
--
--   1. A WhatConverts-sourced proposal may only exist on the account that owns
--      its lead. Checked on INSERT, and on any UPDATE that changes account_id or
--      lead_key. Deliberately NOT checked on other updates: a lead legitimately
--      disappears (deleted upstream) and the proposal must still be editable and
--      archivable afterwards — blocking that would be a worse bug than the one
--      being fixed.
--
--   2. One WhatConverts lead can back at most ONE proposal, portal-wide.
--      WC lead_ids are globally unique, so two accounts holding a proposal for
--      the same lead_key is by definition contamination.
--
-- Audited before applying: 0 proposals sit on an account that does not own their
-- lead, and 0 lead_keys are duplicated across accounts, so both hold on current
-- data.

-- ── 1. a proposal must belong to the account that owns its lead ───────────────
create or replace function public.assert_proposal_lead_tenancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_account uuid;
  owner_name    text;
begin
  -- Only rows minted from a synced lead have a lead to be checked against.
  -- 'seed'/NULL rows (hand-created, fixtures) have no upstream owner.
  if coalesce(new.source, '') <> 'whatconverts' then
    return new;
  end if;

  -- Identity unchanged on an UPDATE → nothing to re-check. This is what keeps a
  -- proposal editable after its lead is gone.
  if tg_op = 'UPDATE'
     and new.account_id = old.account_id
     and new.lead_key   = old.lead_key then
    return new;
  end if;

  select l.account_id into owner_account
    from public.leads l
   where l.wc_lead_id = new.lead_key
   limit 1;

  -- No lead row anywhere: can't prove ownership either way. Allow it — the drain
  -- mints from a lead it just read, and refusing here would break legitimate
  -- re-inserts of a proposal whose lead has since been pruned.
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

drop trigger if exists proposals_lead_tenancy on public.proposals;
create trigger proposals_lead_tenancy
  before insert or update on public.proposals
  for each row execute function public.assert_proposal_lead_tenancy();

-- ── 2. one synced lead backs at most one proposal, portal-wide ────────────────
-- proposals already has unique (account_id, lead_key), which permits the SAME
-- lead on two different accounts — exactly the contamination shape. WC lead_ids
-- are globally unique, so this closes it.
create unique index if not exists proposals_wc_lead_key_unique
  on public.proposals (lead_key)
  where source = 'whatconverts';

comment on function public.assert_proposal_lead_tenancy() is
  'A whatconverts-sourced proposal may only live on the account that owns its lead. Guards INSERT and any change to account_id/lead_key; other updates pass so a proposal stays editable after its lead is pruned.';
