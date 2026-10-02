-- Hosted docs · accept notifications.
--
-- A hosted document's Accept button now tells the gate page, which relays to
-- the hosted-doc edge fn (action "accept"). The fn appends an `accepted` event
-- and emails Alloy. `meta` carries what the reader chose and typed (option,
-- price, terms sentence, name, title) so the opens view can show who accepted.
-- Nothing is signed or billed by this — it is a notification + audit row.

alter table public.hosted_doc_events
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.hosted_doc_events.event_type is 'open | denied | accepted';

-- Rebuild the staff view with accept columns (new columns in the middle →
-- drop + create rather than create or replace). Still security_invoker.
drop view if exists public.hosted_doc_opens;
create view public.hosted_doc_opens
  with (security_invoker = true) as
select
  d.slug,
  d.title,
  d.expires_at,
  count(e.id) filter (where e.event_type = 'open')                      as opens,
  count(distinct e.viewer_key) filter (where e.event_type = 'open')     as viewers,
  min(e.created_at) filter (where e.event_type = 'open')                as first_open,
  max(e.created_at) filter (where e.event_type = 'open')                as last_open,
  count(e.id) filter (where e.event_type = 'denied')                    as wrong_password,
  count(e.id) filter (where e.event_type = 'accepted')                  as accepted,
  max(e.created_at) filter (where e.event_type = 'accepted')            as last_accepted,
  (select concat_ws(' · ', nullif(x.meta->>'name', ''), nullif(x.meta->>'option', ''))
     from public.hosted_doc_events x
    where x.doc_id = d.id and x.event_type = 'accepted'
    order by x.created_at desc limit 1)                                 as accepted_by,
  d.created_at,
  d.updated_at
from public.hosted_docs d
left join public.hosted_doc_events e on e.doc_id = d.id
group by d.id, d.slug, d.title, d.expires_at, d.created_at, d.updated_at;
