-- Onboarding locations carry manager · hours · notes as well as address · phone.
-- Same merge as 20261001180000, now copying the three extra fields through to
-- accounts.locations (so the Admin Locations tab shows "main office / satellite,
-- 3 staff" straight from what the client typed).
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
        'phone',      coalesce(nullif(btrim(r.fields->>'phone'), ''),   entry->>'phone', ''),
        'manager',    coalesce(nullif(btrim(r.fields->>'manager'), ''), entry->>'manager', ''),
        'hours',      coalesce(nullif(btrim(r.fields->>'hours'), ''),   entry->>'hours', ''),
        'notes',      coalesce(nullif(btrim(r.fields->>'notes'), ''),   entry->>'notes', ''),
        'source_key', linked);
      used := array_append(used, linked);
      result := result || jsonb_build_array(entry);
    elsif entry->>'source_key' is not null and coalesce(entry->>'source', '') = 'onboarding' then
      continue;
    else
      result := result || jsonb_build_array(entry - 'source_key');
    end if;
  end loop;

  for r in select i.* from public.onboarding_items i
            where i.account_id = p_account and i.section = 'locations' and btrim(i.label) <> ''
              and not (i.key = any(used))
            order by i.sort, i.created_at loop
    result := result || jsonb_build_array(jsonb_build_object(
      'name', btrim(r.label), 'hq', false,
      'address', coalesce(btrim(r.fields->>'address'), ''),
      'phone',   coalesce(btrim(r.fields->>'phone'), ''),
      'manager', coalesce(btrim(r.fields->>'manager'), ''),
      'hours',   coalesce(btrim(r.fields->>'hours'), ''),
      'notes',   coalesce(btrim(r.fields->>'notes'), ''),
      'status', '', 'tag', 'onboarding',
      'source', 'onboarding', 'source_key', r.key));
  end loop;

  select bool_or(coalesce((e->>'hq')::boolean, false)) into has_hq from jsonb_array_elements(result) e;
  if not coalesce(has_hq, false) and jsonb_array_length(result) > 0 then
    result := jsonb_set(result, '{0,hq}', 'true'::jsonb);
  end if;

  update public.accounts set locations = result where id = p_account;
end;
$$;
revoke all on function public.onboarding_sync_locations(uuid) from public, anon, authenticated;
