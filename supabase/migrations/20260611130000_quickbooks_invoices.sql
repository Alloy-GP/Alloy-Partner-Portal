-- QuickBooks Online invoices: per-client invoice list + downloadable PDFs.
-- Mirrors the WhatConverts/Monday/Zendesk integration pattern:
--   * accounts.quickbooks_customer_id links an account to a QBO Customer.Id
--     (staff paste the `nameId` from the QBO customer URL — names vary too much
--     to auto-match, e.g. "RISE" ↔ "Rise Association Management").
--   * a nightly sync upserts invoice metadata into `invoices`.
--   * the actual PDF is fetched on-demand from QBO (never stored here).

-- 1) Per-client QBO customer link (like monday_board_id / whatconverts_profile_id).
alter table public.accounts
  add column if not exists quickbooks_customer_id text;

-- 2) Synced invoice metadata (one row per QBO invoice, per account).
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  qbo_invoice_id  text not null,                 -- QuickBooks Invoice.Id
  doc_number      text,                          -- human invoice # (DocNumber)
  txn_date        date,                          -- issue date (TxnDate)
  due_date        date,                          -- DueDate
  total_amount    numeric(14,2) default 0,       -- TotalAmt
  balance         numeric(14,2) default 0,       -- Balance (0 = paid)
  status          text check (status in ('open','paid','overdue','void')),
  currency        text default 'USD',
  synced_at       timestamptz not null default now(),
  sort            int not null default 0,        -- newest-first ordering
  created_at      timestamptz not null default now(),
  unique (account_id, qbo_invoice_id)
);
create index if not exists invoices_account_id_idx on public.invoices(account_id);

alter table public.invoices enable row level security;

-- Clients read their own account's invoices; staff read any.
-- (UI gates who *sees* the billing screen via perms.js `billing` cap; this is
-- just account-scoping at the data layer. Writes go only through the service
-- role inside the sync function.)
create policy "acct read" on public.invoices
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.invoices
  for select to authenticated using (public.is_staff());

-- 3) Single QBO connection for Alloy's own company file. Holds the rotating
-- OAuth tokens (the refresh token is re-issued on every refresh, so it must be
-- stored mutably — an env secret can't be rewritten per-run). RLS on with NO
-- policies: only the service role (edge functions) may ever touch this.
create table if not exists public.quickbooks_oauth (
  realm_id                 text primary key,      -- QBO company id
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  updated_at               timestamptz not null default now()
);
alter table public.quickbooks_oauth enable row level security;
