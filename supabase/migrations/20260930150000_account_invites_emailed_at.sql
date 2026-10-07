-- Invites: record WHEN (and whether) the invite email went out.
--
-- Adding someone to an account used to always email them a sign-in link on the
-- spot. Staff now choose: add quietly (e.g. a new client whose first email
-- should be the proposal, not a "welcome to your portal" that they can't use
-- yet), or email now, or email later from the Team & access list. emailed_at
-- is what the list shows ("invite sent Sep 30" vs "not emailed yet") and what
-- the Send / Resend button keys off.
--
-- Every invite that exists today WAS emailed at creation (that was the only
-- path), so backfill emailed_at = created_at. Additive.

alter table public.account_invites add column if not exists emailed_at timestamptz;
update public.account_invites set emailed_at = created_at where emailed_at is null;
