-- Proposal system · the closed-deal amount (set when a proposal is marked Won).
-- Distinct from quote_value (the qualified estimate). Additive, nullable.
alter table public.proposals
  add column if not exists sales_value integer;
