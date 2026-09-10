-- Alert hysteresis: a flapping job must not email on every flip.
--
-- First night of the watchdog: whatconverts-daily failed 19 of 41 runs (RISE's
-- lead upsert hitting the 8s statement timeout), never twice the same way, and
-- monday-daily hit one 150s idle timeout. Every fail->ok->fail cycle produced a
-- "failing" and a "recovered" email: 11 incidents, 22 emails in 20 hours for
-- what is ONE problem. sync-monitor now (a) opens a frequent job's alert only
-- after 2 consecutive failures or >=3 failures in 6h, (b) holds a recovery for
-- 2h before resolving and emailing, (c) counts the flips. These columns carry
-- that state.
alter table public.sync_alerts
  add column if not exists clear_since timestamptz,          -- problem absent since (recovery hold running)
  add column if not exists flap_count  integer not null default 0;  -- times it came back during a hold
