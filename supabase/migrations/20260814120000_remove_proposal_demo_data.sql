-- Clean the proposal pipeline down to reality: CMGT's real leads, and nothing else.
--
-- APPLIED 2026-08-14 against project aryttfcmleukwstknvio via the service-role
-- API (no Supabase CLI/MCP was available), with a full JSON backup of every
-- deleted row taken first. Result verified: 151 -> 41 proposals, 280 -> 56
-- events, 0 seeded rows, 0 proposals outside CMGT, proposals_enabled true only
-- for CMGT. This file is the durable, idempotent record of that change — running
-- it again is a no-op.
--
-- Audited against the live DB before writing this (151 proposal rows, 280 events):
--
--   account    enabled  rows  visible  seeded
--   Edison     false      90       90       0   <- should not exist at all
--   CMGT       false      47       19       6   <- 6 fabricated demo boards
--   Northstar  true        8        8       8   <- the whole demo account
--   Tidewater  false       6        6       0   <- should not exist at all
--
-- THREE separate problems, fixed here:
--
-- 1. FABRICATED BOARDS (14 rows). proposals.source is 'whatconverts' for a row
--    minted from a synced lead and 'seed' for a fabricated one (backfilled from
--    lead_key shape in 20260811230000). All 14 'seed' rows are demo: 6 CMGT
--    boards from scripts/seed-proposals.mjs (Hollywood Hills, Cypress Lakes, Oak
--    Grove, Pecan Trail, Seabrook Pointe, Magnolia Trace — fictional communities
--    sitting on the REAL CMGT account, which is why they showed up in CMGT's
--    cockpit beside real prospects) and 8 Northstar boards from the reset-demo
--    edge function. Both seeders are deleted in this same change.
--
-- 2. PROPOSALS ON ACCOUNTS THAT DON'T RUN PROPOSALS (96 rows). Edison's 90 and
--    Tidewater's 6 are real-lead-derived but were never meant to exist: the
--    intake drain minted a row per eligible lead for whatever account a staffer
--    had open. src/lib/proposalAccess.js canMintProposals() now blocks that at
--    the source, so this delete stays deleted. The underlying `leads` rows (1000
--    of them) are NOT touched — only the derived pipeline is.
--
-- 3. THE proposals_enabled COLUMN WAS WRONG. CMGT — the actual pilot client —
--    was false, and the demo account was the only true. The code no longer gates
--    on this column for exactly that reason (a gate on unmaintained data fails
--    silently and locks the real client out); it is now an informational marker
--    for Admin -> Proposals, so it is corrected to match reality.
--
-- WHAT IS DELIBERATELY LEFT ALONE:
--   * CMGT's 28 ARCHIVED rows. They are functional tombstones — the intake drain
--     decides "new" by "has no proposal row", so hard-deleting an archived row
--     makes the next drain re-mint (and re-LLM-match) it. Archived rows are
--     already invisible in every stage of the cockpit.
--   * Every non-archived REAL CMGT proposal (13 of them, including Stonebridge
--     Condominiums which has 56 real board-engagement events).
--
-- Hard delete rather than archive: an archived row stays visible in the cockpit's
-- Archive bin, which is what we are clearing out. proposal_events.proposal_id and
-- every accounts(id) reference are ON DELETE CASCADE, so events and the demo
-- account's proposal_uvps go with their parents. Idempotent.

-- ── 1. the 14 fabricated demo boards ─────────────────────────────────────────
delete from public.proposals
 where coalesce(source, 'seed') <> 'whatconverts'   -- rail: never a synced lead
   and (
     lead_key in (
       -- CMGT's 6 seeded boards
       'HOL-2026-LA93', 'CYP-2026-LA48', 'OAK-2026-LA61',
       'PEC-2026-LA08', 'SEA-2026-MS22', 'MAG-2026-MS12',
       -- Northstar's 8 seeded boards
       'NS-SABAL-01', 'NS-KING-02', 'NS-CYPB-03', 'NS-HERON-04',
       'NS-MAGR-05', 'NS-OAKM-06', 'NS-PALM-07', 'NS-WIND-08'
     )
     or account_id = 'de300000-0000-4000-8000-000000000001'
   );

-- ── 2. pipelines on accounts that don't run proposals ────────────────────────
-- Proposals is a CMGT-only pilot, so a proposal row on any other account is an
-- artifact of the ungated drain. Resolve CMGT by short_name (never a hardcoded
-- id) and refuse to run at all if that lookup finds nothing, so a rename can
-- never turn this into "delete every proposal in the database".
do $$
declare
  cmgt_id uuid;
  removed int;
begin
  select id into cmgt_id from public.accounts where short_name = 'CMGT';
  if cmgt_id is null then
    raise exception 'No account with short_name = ''CMGT'' — refusing to prune proposals by account.';
  end if;

  delete from public.proposals where account_id <> cmgt_id;
  get diagnostics removed = row_count;
  raise notice 'Pruned % proposal row(s) from non-CMGT accounts.', removed;
end $$;

-- Any telemetry orphaned by an earlier hand-deletion of its parent.
delete from public.proposal_events pe
 where not exists (select 1 from public.proposals p where p.id = pe.proposal_id);

-- ── 3. the Northstar demo ACCOUNT ────────────────────────────────────────────
-- Everything referencing accounts(id) is ON DELETE CASCADE except
-- profiles.account_id (ON DELETE SET NULL) — nulling a real person's account
-- would silently lock them out of the portal, so refuse if anyone is attached.
-- (Audited: 0 profiles reference it.)
do $$
declare
  demo_id uuid := 'de300000-0000-4000-8000-000000000001';
  attached int;
begin
  select count(*) into attached from public.profiles where account_id = demo_id;
  if attached > 0 then
    raise notice 'Northstar demo account KEPT: % profile(s) still reference it. Reassign them, then delete the account.', attached;
  else
    delete from public.accounts where id = demo_id;
  end if;
end $$;

-- ── 4. make proposals_enabled tell the truth ─────────────────────────────────
-- Informational only (Admin -> Proposals list); access lives in
-- src/lib/proposalAccess.js. CMGT on, everyone else off.
update public.accounts
   set proposals_enabled = (coalesce(short_name, '') = 'CMGT')
 where proposals_enabled <> (coalesce(short_name, '') = 'CMGT');
