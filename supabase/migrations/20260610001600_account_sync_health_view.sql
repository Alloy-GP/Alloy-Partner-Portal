-- Per-account sync health, aggregated server-side (avoids client row caps).
-- security_invoker so the caller's RLS applies (staff see all; clients see own).
create or replace view account_sync_health
with (security_invoker = true) as
select
  a.id, a.company, a.short_name,
  (a.monday_board_id is not null and a.monday_board_id <> '') as has_monday,
  (a.zendesk_org_id is not null and a.zendesk_org_id <> '') as has_zendesk,
  (a.whatconverts_profile_id is not null and a.whatconverts_profile_id <> '') as has_wc,
  coalesce(a.wc_qualified_total, 0) as qualified,
  (select count(*) from leads l where l.account_id = a.id) as leads,
  (select count(*) from projects p where p.account_id = a.id) as projects,
  (select count(*) from recurring_services s where s.account_id = a.id) as services,
  (select count(*) from action_items ai where ai.account_id = a.id) as actions,
  greatest(
    (select max(l.created_at) from leads l where l.account_id = a.id),
    (select max(p.created_at) from projects p where p.account_id = a.id)
  ) as last_sync
from accounts a;

grant select on account_sync_health to authenticated;
