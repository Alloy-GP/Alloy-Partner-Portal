-- Onboarding ACH capture: clients enter their bank account once during the
-- onboarding series so Alloy can set up autopay (recurring sales receipts).
--
-- PCI/NACHA notes:
--   * We NEVER store account/routing numbers. Raw bank details go browser →
--     Intuit (tokenized); we keep only the QBO bank-account id + masked last-4.
--   * ACH debit authorization is captured per NACHA: who authorized, when, and
--     which agreement version. Required to debit a bank on a recurring basis.
create table if not exists public.quickbooks_payment_methods (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references public.accounts(id) on delete cascade,
  qbo_bank_account_id   text not null,            -- Payments API bank-account id (a reference, not the account #)
  last4                 text,
  account_name          text,                     -- name on the bank account
  bank_name             text,
  account_type          text,                     -- e.g. BUSINESS_CHECKING
  verification_status   text,                     -- QBO verificationStatus
  is_default            boolean default true,
  ach_authorized_at     timestamptz,              -- NACHA: when the client authorized recurring debit
  ach_authorized_by     uuid,                     -- auth.users id of the authorizer
  ach_agreement_version text,                     -- which authorization agreement they accepted
  created_at            timestamptz not null default now(),
  unique (account_id, qbo_bank_account_id)
);
create index if not exists quickbooks_payment_methods_account_id_idx
  on public.quickbooks_payment_methods(account_id);

alter table public.quickbooks_payment_methods enable row level security;

-- Clients read their own account's method-on-file summary (last-4 only); staff
-- read any. Writes go solely through the quickbooks-payment-method function.
create policy "acct read" on public.quickbooks_payment_methods
  for select to authenticated using (account_id = public.current_account_id());
create policy "staff read" on public.quickbooks_payment_methods
  for select to authenticated using (public.is_staff());
