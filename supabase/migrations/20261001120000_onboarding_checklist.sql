-- Onboarding checklist — replaces the Google Sheet Alloy emailed each new client
-- (tabs: Team & Contacts · Access & Credentials · Business Resources · Marketing
-- & Tracking). One row per line item per account, instantiated from the template
-- in src/lib/onboarding.js by the `admin` edge function (onboarding_start /
-- onboarding_reset) — automatically when a client is created in Admin, so it is
-- part of onboarding instead of a sheet someone remembers to send and reset.
--
-- Clients edit their own rows (status + the credential/contact fields) straight
-- from the portal under RLS; staff see every account and set `alloy_status`
-- (the sheet's "Alloy Confirm" column — trigger-guarded so a client can't tick
-- it). Lifecycle stamps live on accounts. Additive + namespaced: dark until an
-- admin starts the first checklist; `drop table ... cascade` is a clean revert.

alter table public.accounts add column if not exists onboarding_started_at   timestamptz;
alter table public.accounts add column if not exists onboarding_completed_at timestamptz;

comment on column public.accounts.onboarding_started_at is
  'When the onboarding checklist was created for this client (Admin → Onboarding → Start, or automatically on client creation). Null = never started → no Onboarding page in the client''s portal.';
comment on column public.accounts.onboarding_completed_at is
  'Staff marked onboarding done. The checklist stays readable (credentials reference) but leaves the client''s action queue and nav badge.';

create table if not exists public.onboarding_items (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  section       text not null,                       -- contacts | access | resources | marketing
  key           text not null,                       -- stable template key (src/lib/onboarding.js) or custom:<uuid>
  label         text not null,                       -- "Google Business Profile" / a contact's full name / a custom tool
  hint          text,                                -- Alloy's guidance shown under the label
  kind          text not null default 'credential',  -- contact | credential | upload | tool → which fields the row shows
  status        text not null default 'pending',     -- the CLIENT's column (the sheet's Status dropdown)
  alloy_status  text,                                -- staff-only "Alloy Confirm"; null until Alloy checks it
  fields        jsonb not null default '{}'::jsonb,  -- credential: {username,password,url,account_number,notes} · upload: {link,notes} · contact: {title,email,phone}
  custom        boolean not null default false,      -- client-added row (extra contact / "other tool") — the client may delete it
  sort          int not null default 0,
  updated_by    text,                                -- name/email of the last editor (client or staff)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint onboarding_items_section_chk check (section in ('contacts','access','resources','marketing')),
  constraint onboarding_items_kind_chk    check (kind in ('contact','credential','upload','tool')),
  constraint onboarding_items_status_chk  check (status in ('pending','request_sent','complete','new_account','stuck','optional','na')),
  constraint onboarding_items_alloy_chk   check (alloy_status is null or alloy_status in ('pending','request_sent','complete','new_account','stuck','optional','na')),
  -- One row per template key per account: lets onboarding_start top up an
  -- existing checklist with new template items without duplicating old ones.
  constraint onboarding_items_key_uniq    unique (account_id, key)
);

create index if not exists onboarding_items_account_idx
  on public.onboarding_items (account_id, section, sort);

alter table public.onboarding_items enable row level security;

-- Read: the client sees their own checklist; staff see every account.
create policy onboarding_items_select on public.onboarding_items
  for select to authenticated
  using (account_id = public.current_account_id() or public.is_staff());

-- Insert: staff any row; a client only CUSTOM rows on their own account
-- (extra contacts, "other tools"). Template rows come from the admin function.
create policy onboarding_items_insert on public.onboarding_items
  for insert to authenticated
  with check (public.is_staff() or (account_id = public.current_account_id() and custom = true));

-- Update: the client edits their own rows (status, fields, label); staff any.
-- alloy_status is additionally trigger-guarded below.
create policy onboarding_items_update on public.onboarding_items
  for update to authenticated
  using (account_id = public.current_account_id() or public.is_staff())
  with check (account_id = public.current_account_id() or public.is_staff());

-- Delete: staff any; a client only their own custom rows.
create policy onboarding_items_delete on public.onboarding_items
  for delete to authenticated
  using (public.is_staff() or (account_id = public.current_account_id() and custom = true));

-- Guard: only Alloy (staff JWT, or the service role used by the admin function)
-- may change alloy_status, and a client can't re-key / re-home a row. Also keeps
-- updated_at fresh. RLS can't express a per-column rule, hence the trigger.
create or replace function public.onboarding_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  alloy boolean := coalesce(auth.role(), '') = 'service_role' or public.is_staff();
begin
  if new.alloy_status is distinct from old.alloy_status and not alloy then
    raise exception 'only Alloy staff can confirm onboarding items';
  end if;
  if (new.account_id <> old.account_id or new.key <> old.key or new.custom <> old.custom) and not alloy then
    raise exception 'onboarding item identity is fixed';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_items_guard_trg on public.onboarding_items;
create trigger onboarding_items_guard_trg
  before update on public.onboarding_items
  for each row execute function public.onboarding_items_guard();
