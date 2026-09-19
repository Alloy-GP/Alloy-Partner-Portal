-- sync-monday: swap one account's Monday mirror rows ATOMICALLY.
--
-- Until now sync-monday mirrored a board with five separate delete-then-insert
-- round trips per account (projects, recurring_services, action_items,
-- ticket_links, toolkit_systems) and a sixth to stamp monday_sync_status. Any
-- failure between a delete and its insert - a PostgREST statement timeout, the
-- gateway's 150s idle timeout killing the request mid-board, a Monday error on
-- the next call, a redeploy - left that client's Projects page EMPTY until the
-- next successful tick (30+ min), and Sync Health said "mapped but empty".
--
-- monday_replace_account_rows does the whole swap in ONE transaction: either
-- the board's new rows and its sync stamp land together, or nothing about that
-- account changes.
--
-- Rows arrive as jsonb arrays keyed by column name. monday_insert_rows inserts
-- ONLY the columns present in the payload (like PostgREST does), so a column
-- the payload omits gets its DEFAULT - not null - and adding a column to a
-- mirror table needs no change here as long as sync-monday sends it. Keys that
-- match no column are ignored. account_id is always forced to the caller's
-- account, so a row can never land under another tenant.
--
-- Called by the service role only (sync-monday). EXECUTE is revoked from
-- anon/authenticated because PostgREST exposes every function a role can run.

create or replace function public.monday_insert_rows(p_table regclass, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  cols text;
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  -- The insert column list = payload keys that are real columns of the table.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
  from pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
    and a.attname in (select distinct k from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k);
  if cols is null then
    raise exception 'monday_insert_rows: no key in the payload matches a column of %', p_table;
  end if;
  execute format('insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1)', p_table, cols, cols, p_table)
    using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.monday_replace_account_rows(
  p_account_id   uuid,
  p_projects     jsonb   default '[]'::jsonb,
  p_actions      jsonb   default '[]'::jsonb,
  p_ticket_links jsonb   default '[]'::jsonb,
  p_toolkit      jsonb   default '[]'::jsonb,
  p_board_items  integer default null,
  p_synced_rows  integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n_projects integer; n_actions integer; n_links integer; n_toolkit integer;
  -- every row is pinned to the caller's account, whatever the payload says
  own jsonb := jsonb_build_object('account_id', p_account_id);
begin
  if p_account_id is null then
    raise exception 'monday_replace_account_rows: p_account_id is required';
  end if;

  delete from public.projects           where account_id = p_account_id;
  delete from public.recurring_services where account_id = p_account_id;  -- kept empty: Ongoing items sync as projects
  delete from public.action_items       where account_id = p_account_id;
  delete from public.ticket_links       where account_id = p_account_id;
  delete from public.toolkit_systems    where account_id = p_account_id;

  n_projects := public.monday_insert_rows('public.projects'::regclass,
    (select jsonb_agg(e || own) from jsonb_array_elements(coalesce(p_projects, '[]'::jsonb)) e));
  n_actions  := public.monday_insert_rows('public.action_items'::regclass,
    (select jsonb_agg(e || own) from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) e));
  n_links    := public.monday_insert_rows('public.ticket_links'::regclass,
    (select jsonb_agg(e || own) from jsonb_array_elements(coalesce(p_ticket_links, '[]'::jsonb)) e));
  n_toolkit  := public.monday_insert_rows('public.toolkit_systems'::regclass,
    (select jsonb_agg(e || own) from jsonb_array_elements(coalesce(p_toolkit, '[]'::jsonb)) e));

  -- The sync stamp travels in the same transaction: a board is only "synced at"
  -- a time its rows actually landed. Sync Health and the watchdog's 2h board
  -- check read this.
  insert into public.monday_sync_status (account_id, board_items, synced_rows, synced_at)
  values (p_account_id, p_board_items, p_synced_rows, now())
  on conflict (account_id) do update
    set board_items = excluded.board_items,
        synced_rows = excluded.synced_rows,
        synced_at   = excluded.synced_at;

  return jsonb_build_object(
    'projects', n_projects, 'actions', n_actions, 'ticket_links', n_links, 'toolkit', n_toolkit);
end
$$;

revoke all on function public.monday_insert_rows(regclass, jsonb) from public, anon, authenticated;
grant execute on function public.monday_insert_rows(regclass, jsonb) to service_role;
revoke all on function public.monday_replace_account_rows(uuid, jsonb, jsonb, jsonb, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.monday_replace_account_rows(uuid, jsonb, jsonb, jsonb, jsonb, integer, integer)
  to service_role;
