-- Proposal system · per-CAM white-label send address. When set (e.g.
-- 'noreply@cmgt.org'), proposal-send uses it as the From address so the board
-- email comes from the CAM's own domain. Requires that domain be verified in
-- Resend first (DKIM/SPF DNS on the CAM's domain). Null → falls back to the
-- shared Alloy domain with the CAM's display name (current behavior).
alter table public.accounts
  add column if not exists proposal_from_email text;
