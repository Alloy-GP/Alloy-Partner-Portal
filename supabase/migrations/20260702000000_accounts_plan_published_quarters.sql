-- Quarter-plan gating for the dashboard "Quarterly Playbook" card.
--
-- At the start of a quarter, before Alloy loads the plan, the card has only a
-- few stray tasks — so its % complete / "vs plan" numbers read as big progress
-- when really nothing's been planned yet. We gate the score card on an explicit,
-- per-quarter "plan published" signal the strategist controls (no inference from
-- noisy task counts). Until the current quarter's label is listed here, the card
-- renders a calm "In planning" state instead of misleading numbers.
--
-- Values are quarter labels matching quarterStats() (e.g. 'Q3 2026'). The
-- sentinel '*' means "always treat as published" (used by demo/mock data).
-- Default '{}' => a brand-new account/quarter starts in planning.
alter table accounts add column if not exists plan_published_quarters text[] not null default '{}';

comment on column accounts.plan_published_quarters is
  'Quarters whose plan is published (e.g. {"Q3 2026"}); the Quarterly Playbook card shows its score only for the current quarter when listed here, else a Planning state. "*" = always published.';
