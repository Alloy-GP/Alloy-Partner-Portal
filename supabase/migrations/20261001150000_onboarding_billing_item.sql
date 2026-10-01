-- Onboarding checklist: the autopay bank step becomes a line item.
--
-- New section 'billing' with one template row (key bank_account, kind
-- 'payment'). Nothing is typed into it: the row's button opens the existing
-- PCI-safe Intuit flow (PaymentSetupModal → tokens → attach) and its status is
-- DERIVED — loadData marks it complete when quickbooks_payment_methods has a row
-- for the account (or 'na' when accounts.autopay_required = false); the admin
-- overview does the same join. While a checklist is open the sign-in modal and
-- banner stand down (App.jsx) so the client gets one nudge, not three.
alter table public.onboarding_items drop constraint if exists onboarding_items_section_chk;
alter table public.onboarding_items add constraint onboarding_items_section_chk
  check (section in ('contacts','billing','access','resources','marketing'));

alter table public.onboarding_items drop constraint if exists onboarding_items_kind_chk;
alter table public.onboarding_items add constraint onboarding_items_kind_chk
  check (kind in ('contact','credential','upload','tool','payment'));
