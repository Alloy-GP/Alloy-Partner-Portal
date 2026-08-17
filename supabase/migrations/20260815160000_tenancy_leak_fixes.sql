-- Close three tenancy defects found by an adversarial audit. Two were LIVE and
-- reachable with the anon key that ships in the public JS bundle; the third
-- defeats the one control the whole isolation model rests on.
--
-- Each was reproduced before fixing and re-tested after.

-- ── 1. account_sync_health was readable by ANYONE (live leak, now closed) ────
-- 20260610001600 created the view WITH (security_invoker = true) — its own comment
-- says that flag IS the tenancy control ("staff see all; clients see own").
-- 20260618193000 then did `create or replace view` with NO WITH clause to append
-- board_items/synced_rows. Postgres replaces the reloption array wholesale rather
-- than merging it, so security_invoker was silently cleared while the grants
-- survived on the reused pg_class row. The view then executed as its owner
-- (postgres, which carries BYPASSRLS) and returned one row PER ACCOUNT.
--
-- Reproduced: an unauthenticated GET /rest/v1/account_sync_health?select=* with
-- only the anon key returned all 10 accounts — company, short_name, which
-- integrations are mapped, per-account lead/project/service/action counts, and
-- every account UUID. Verified after: 401 permission denied for anon, and a real
-- staff session still gets all 10 rows.
--
-- NOTE FOR ANYONE EDITING THIS VIEW LATER: `create or replace view` DROPS the
-- reloptions. Always re-state WITH (security_invoker = true), or re-run this alter.
alter view public.account_sync_health set (security_invoker = true);
revoke all on public.account_sync_health from anon;

comment on view public.account_sync_health is
  'Per-account integration/sync health. security_invoker=true is the tenancy control: RLS is evaluated as the CALLER, so clients see only their own row and staff see all. A create-or-replace WITHOUT the WITH clause silently clears this flag and exposes every account — re-state it after any edit.';

-- ── 2. snapshot_recipient_emails leaked client emails (live leak, now closed) ─
-- SECURITY DEFINER over account_invites — a table with RLS enabled and ZERO
-- policies precisely so nobody can read it — and it kept Postgres's default
-- EXECUTE-to-PUBLIC, which Supabase exposes to anon and authenticated over
-- PostgREST. Its siblings (auth_uid_by_email, handle_new_user) were revoked;
-- this one was missed.
--
-- Reproduced: POST /rest/v1/rpc/snapshot_recipient_emails with only the anon key
-- and NO login, passing another account's UUID, returned that client's portal
-- users' email addresses. Both real callers are service-role edge functions
-- (admin, auto-send-snapshots), so revoking costs nothing.
revoke all on function public.snapshot_recipient_emails(uuid) from public;
revoke all on function public.snapshot_recipient_emails(uuid) from anon;
revoke all on function public.snapshot_recipient_emails(uuid) from authenticated;

-- Same treatment for the two trigger functions added in 20260811230000 and
-- 20260815120000 — mine, and I should have revoked them at creation. Trigger
-- functions cannot usefully be called over PostgREST, so this is defence in
-- depth rather than a live hole, but SECURITY DEFINER should never be
-- browser-executable.
revoke all on function public.assert_wc_accounts_unclaimed() from public, anon, authenticated;
revoke all on function public.assert_proposal_lead_tenancy() from public, anon, authenticated;
revoke all on function public.assert_lead_account_immutable() from public, anon, authenticated;

-- ── 3. the exclusivity trigger could be defeated by typing a SPACE ───────────
-- assert_wc_accounts_unclaimed tokenizes accounts.whatconverts_profile_id with
-- string_to_array(..., ',') — COMMAS ONLY. Every consumer splits on comma OR ANY
-- WHITESPACE: sync-whatconverts parseAccountIds and src/lib/wcProfiles.js both use
-- /[,\s]+/.
--
-- So if account A holds '116805' and a staffer types '115145 116805' into the
-- unvalidated admin field, the trigger unnests ONE token — the literal string
-- '115145 116805' — which matches no other account's '116805'. No clash is
-- detected, the save is accepted, and the same WhatConverts account is now claimed
-- twice: the exact precondition this trigger exists to forbid. The next sync then
-- parses two ids, fetches 116805, and files those leads under A.
--
-- Proven in situ: string_to_array('115145 116805', ',') -> {'115145 116805'}
--                 the app's split                       -> {115145, 116805}
--
-- Fixed by tokenizing exactly as the application does, on both sides of the
-- comparison, using regexp_split_to_table so commas AND whitespace both separate.
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
             regexp_split_to_table(coalesce(a.whatconverts_profile_id, ''), '[,\s]+') t
       where a.id <> new.id
         and btrim(t) <> ''
         and btrim(t) in (
           select btrim(t2)
             from regexp_split_to_table(coalesce(new.whatconverts_profile_id, ''), '[,\s]+') t2
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

revoke all on function public.assert_wc_accounts_unclaimed() from public, anon, authenticated;

-- ── 4. the other integration ids had no exclusivity at all ───────────────────
-- 20260617000000 gave the three Monday board ids partial unique indexes after two
-- clients were pointed at one board. zendesk_org_id and quickbooks_customer_id
-- never got the same treatment, and a shared zendesk_org_id defeats the ticket
-- guards by construction: supabase/functions/zendesk/index.ts compares each
-- ticket's organization_id against the id resolved for the current account, so two
-- accounts sharing one org id would each match the other's tickets.
-- Audited first: no current duplicates, so both indexes apply cleanly.
create unique index if not exists accounts_zendesk_org_unique
  on public.accounts (zendesk_org_id)
  where zendesk_org_id is not null and btrim(zendesk_org_id) <> '';

create unique index if not exists accounts_quickbooks_customer_unique
  on public.accounts (quickbooks_customer_id)
  where quickbooks_customer_id is not null and btrim(quickbooks_customer_id) <> '';
