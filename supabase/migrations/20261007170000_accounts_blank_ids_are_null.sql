-- Blank integration ids on accounts are NULL. As a database fact.
--
-- Why: Happy CAM was created in Admin on 2026-10-02 with the integration fields
-- left empty. The form saved '' (empty string), not NULL, for monday_board_id,
-- zendesk_org_id, whatconverts_profile_id and quickbooks_customer_id. Every
-- sync selects "mapped" accounts with `.not(col, "is", null)`, so '' counted as
-- mapped: sync-monday asked Monday for board "" every 30 minutes ("board not
-- found"), rollup-whatconverts failed its weekly run ("no WhatConverts account
-- id configured"), and the watchdog emailed staff about both every day, naming
-- an account uuid. The Sync Health view already treats '' as unmapped
-- (`is not null and <> ''`), so the UI showed nothing wrong.
--
-- One rule, enforced where every writer passes: a BEFORE trigger turns a blank
-- or whitespace-only id into NULL on insert and update. Admin normalises too,
-- but the trigger is what makes "not null = mapped" true for every consumer.
create or replace function public.accounts_blank_ids_to_null()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.monday_board_id         := nullif(btrim(new.monday_board_id), '');
  new.monday_roadmap_board_id := nullif(btrim(new.monday_roadmap_board_id), '');
  new.monday_program_board_id := nullif(btrim(new.monday_program_board_id), '');
  new.monday_assets_board_id  := nullif(btrim(new.monday_assets_board_id), '');
  new.monday_service_group_id := nullif(btrim(new.monday_service_group_id), '');
  new.zendesk_org_id          := nullif(btrim(new.zendesk_org_id), '');
  new.whatconverts_profile_id := nullif(btrim(new.whatconverts_profile_id), '');
  new.quickbooks_customer_id  := nullif(btrim(new.quickbooks_customer_id), '');
  new.dash_folder_id          := nullif(btrim(new.dash_folder_id), '');
  return new;
end
$$;

drop trigger if exists accounts_blank_ids_to_null on public.accounts;
create trigger accounts_blank_ids_to_null
  before insert or update on public.accounts
  for each row execute function public.accounts_blank_ids_to_null();

-- Existing rows: a no-op update runs the trigger over every account that holds
-- a blank id today (Happy CAM: monday, zendesk, whatconverts, quickbooks).
update public.accounts
   set id = id
 where '' in (
   btrim(monday_board_id), btrim(monday_roadmap_board_id), btrim(monday_program_board_id),
   btrim(monday_assets_board_id), btrim(monday_service_group_id), btrim(zendesk_org_id),
   btrim(whatconverts_profile_id), btrim(quickbooks_customer_id), btrim(dash_folder_id)
 );
