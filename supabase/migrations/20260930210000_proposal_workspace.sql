-- Admin proposal workspace (design handoff "Manage Clients redesign").
--
-- Four small additions the tabbed proposal editor needs:
--   markets     — which of the client's locations THIS proposal covers (names,
--                 chosen from the account's locations; the page and the
--                 agreement use these instead of "first N locations")
--   sections    — per-proposal show/hide for the six page sections {s1..s6}
--   spoc        — the client's point of contact named before acceptance; at
--                 acceptance the signer takes over in the agreement
--   valid_days  — the validity window staff type ("valid for 30 days"); the
--                 send stamps valid_through = today + valid_days
-- Plans gain an optional `show` flag inside the existing jsonb (hidden plans
-- stay authored but don't render). Additive.

alter table public.engagement_proposals
  add column if not exists markets     text[]  not null default '{}',
  add column if not exists sections    jsonb   not null default '{}'::jsonb,
  add column if not exists spoc        text,
  add column if not exists valid_days  integer not null default 30;
