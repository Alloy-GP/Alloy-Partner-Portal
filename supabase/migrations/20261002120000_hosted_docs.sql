-- Hosted docs · password-gated standalone HTML documents at growth.alloygp.co/p/<slug>.
--
-- For one-off documents that don't fit the portal's data model (e.g. a custom
-- proposal built elsewhere as a single self-contained HTML file). The whole
-- document lives in the `html` column — like `guides.html` — and is rendered
-- shell-less inside an isolated <iframe srcdoc>. The repo is PUBLIC, so client
-- pricing/PII must never be committed under public/; it lives here instead.
--
-- Access model: a shared review password per document. The `hosted-doc` edge
-- function (service role) checks it and appends one `hosted_doc_events` row per
-- successful open (and per wrong-password attempt). Neither table has a client
-- write policy; staff read both (Admin / SQL). Clients never see these rows.

create table if not exists public.hosted_docs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  title       text not null default '',
  password    text not null,                -- shared review password (staff-managed)
  html        text not null default '',     -- the full standalone document
  expires_at  timestamptz,                  -- null = no expiry
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.hosted_docs enable row level security;

-- Staff manage; nobody else reads (the edge fn serves readers via service role).
create policy hosted_docs_staff_all on public.hosted_docs
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists hosted_docs_touch on public.hosted_docs;
create trigger hosted_docs_touch
  before update on public.hosted_docs
  for each row execute function public.proposal_uvps_set_updated_at();

-- Append-only open log. Written ONLY by the hosted-doc edge fn (service role);
-- deliberately no insert/update/delete policy for any client role.
create table if not exists public.hosted_doc_events (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.hosted_docs(id) on delete cascade,
  event_type  text not null default 'open',   -- open | denied (wrong password)
  viewer_key  text not null default '',       -- anonymous per-device id (localStorage)
  user_agent  text not null default '',
  referrer    text not null default '',
  ip          text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists hosted_doc_events_doc_idx
  on public.hosted_doc_events (doc_id, created_at);

alter table public.hosted_doc_events enable row level security;

create policy hosted_doc_events_staff_select on public.hosted_doc_events
  for select to authenticated
  using (public.is_staff());

-- One row per document: how many opens, how many distinct devices, first/last
-- open, wrong-password attempts. security_invoker → the caller's RLS applies
-- (staff only). Open it in the Supabase Table Editor or `select * from hosted_doc_opens`.
create or replace view public.hosted_doc_opens
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
  d.created_at,
  d.updated_at
from public.hosted_docs d
left join public.hosted_doc_events e on e.doc_id = d.id
group by d.id, d.slug, d.title, d.expires_at, d.created_at, d.updated_at;
