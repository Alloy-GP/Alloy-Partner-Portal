-- Autopay onboarding nudge: clients with a billing role are prompted at sign-in
-- (soft nudge + persistent banner) until their account has a bank on file in
-- quickbooks_payment_methods. This flag lets Alloy exempt accounts that are
-- billed another way (or Alloy's own account) so they are never nagged.
-- Editable in Admin → client → Billing. Default ON for every new client.
alter table public.accounts
  add column if not exists autopay_required boolean not null default true;
