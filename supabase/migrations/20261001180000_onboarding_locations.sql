-- Onboarding checklist: locations (name · address · phone) feed accounts.locations.
--
-- New free-form section 'locations' (kind 'location'; the row's label is the
-- location name, fields {address, phone}). Clients own these rows under RLS
-- but cannot write accounts, so a SECURITY DEFINER trigger merges them into
-- accounts.locations — the same jsonb the Admin Locations tab, the proposal's
-- market chips and the Account page read. Merge rules (onboarding_sync_locations):
--   · an entry linked to a row (source_key) or matching it by name is refreshed
--     from the row (name/address/phone); hq/status/tag stay as staff set them
--   · a row with no entry becomes a new entry tagged 'onboarding' + source='onboarding'
--   · a deleted row removes its entry ONLY if onboarding created it; staff
--     entries are kept and just unlinked
--   · exactly one HQ: whatever staff set, else the first entry
-- onboarding_start seeds one row per existing staff location (admin fn), so the
-- client sees what we already know and adds the address + phone.

alter table public.onboarding_items drop constraint if exists onboarding_items_section_chk;
alter table public.onboarding_items add constraint onboarding_items_section_chk
  check (section in ('contacts','locations','billing','access','resources','marketing'));

alter table public.onboarding_items drop constraint if exists onboarding_items_kind_chk;
alter table public.onboarding_items add constraint onboarding_items_kind_chk
  check (kind in ('contact','location','credential','upload','tool','payment'));

create or replace function public.onboarding_sync_locations(p_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur     jsonb;
  result  jsonb := '[]'::jsonb;
  entry   jsonb;
  r       record;
  used    text[] := '{}';
  linked  text;
  has_hq  boolean;
begin
  select locations into cur from public.accounts where id = p_account;
  if not found then return; end if;
  if cur is null or jsonb_typeof(cur) <> 'array' then cur := '[]'::jsonb; end if;

  -- 1) existing entries: refresh the ones that have (or now match) a row
  for entry in select e from jsonb_array_elements(cur) e loop
    linked := null;
    select i.key into linked
      from public.onboarding_items i
     where i.account_id = p_account and i.section = 'locations' and btrim(i.label) <> ''
       and not (i.key = any(used))
       and (i.key = entry->>'source_key'
            or (entry->>'source_key' is null
                and lower(btrim(i.label)) = lower(btrim(coalesce(entry->>'name', '')))))
     order by i.sort, i.created_at
     limit 1;
    if linked is not null then
      select i.* into r from public.onboarding_items i where i.account_id = p_account and i.key = linked;
      entry := entry || jsonb_build_object(
        'name',       btrim(r.label),
        'address',    coalesce(nullif(btrim(r.fields->>'address'), ''), entry->>'address', ''),
        'phone',      coalesce(nullif(btrim(r.fields->>'phone'), ''), entry->>'phone', ''),
        'source_key', linked);
      used := array_append(used, linked);
      result := result || jsonb_build_array(entry);
    elsif entry->>'source_key' is not null and coalesce(entry->>'source', '') = 'onboarding' then
      continue;  -- onboarding created it and the client removed the row
    else
      result := result || jsonb_build_array(entry - 'source_key');  -- staff entry: keep, unlink
    end if;
  end loop;

  -- 2) rows with no entry yet → new locations, tagged onboarding
  for r in select i.* from public.onboarding_items i
            where i.account_id = p_account and i.section = 'locations' and btrim(i.label) <> ''
              and not (i.key = any(used))
            order by i.sort, i.created_at loop
    result := result || jsonb_build_array(jsonb_build_object(
      'name', btrim(r.label), 'hq', false,
      'address', coalesce(btrim(r.fields->>'address'), ''),
      'phone',   coalesce(btrim(r.fields->>'phone'), ''),
      'status', '', 'tag', 'onboarding',
      'source', 'onboarding', 'source_key', r.key));
  end loop;

  -- 3) exactly one HQ: staff's choice stands; otherwise the first entry
  select bool_or(coalesce((e->>'hq')::boolean, false)) into has_hq from jsonb_array_elements(result) e;
  if not coalesce(has_hq, false) and jsonb_array_length(result) > 0 then
    result := jsonb_set(result, '{0,hq}', 'true'::jsonb);
  end if;

  update public.accounts set locations = result where id = p_account;
end;
$$;
revoke all on function public.onboarding_sync_locations(uuid) from public, anon, authenticated;

create or replace function public.onboarding_items_locations_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.section = 'locations' then perform public.onboarding_sync_locations(old.account_id); end if;
    return old;
  end if;
  if new.section = 'locations' or (tg_op = 'UPDATE' and old.section = 'locations') then
    perform public.onboarding_sync_locations(new.account_id);
  end if;
  return new;
end;
$$;

drop trigger if exists onboarding_items_locations_sync on public.onboarding_items;
create trigger onboarding_items_locations_sync
  after insert or update or delete on public.onboarding_items
  for each row execute function public.onboarding_items_locations_trg();
