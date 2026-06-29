-- Proposal system · persisted match. When a proposal is started from a real
-- intake we run the LLM matcher (proposal-match) ONCE and store the result here,
-- so the match is stable (the board sees the same thing), survives reload, and
-- we don't re-call the LLM on every load. enrichLead prefers this when present,
-- else baked LLM matches (demo), else the deterministic tag engine.
alter table public.proposals
  add column if not exists match_snapshot jsonb;
