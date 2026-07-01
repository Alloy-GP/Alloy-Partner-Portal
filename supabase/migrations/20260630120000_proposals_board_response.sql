-- Board verdict: the single, board-level decision on a proposal (continue /
-- decline / changes) + who recorded it + when. Distinct from `status` (the CAM's
-- pipeline stage) and from proposal_events (per-viewer voice/telemetry).
--
-- The board_token link is forwarded among board members; each has a voice
-- (questions/notes, recorded as events), but the VERDICT is singular and
-- forward-only — the first terminal response wins and the doc then shows a
-- resolved banner to everyone, so a later viewer can't silently flip it.
-- Cleared on (re)send by proposal-send, which reopens the proposal for response.
alter table proposals add column if not exists board_response jsonb;

comment on column proposals.board_response is
  'Board verdict {action: continue|decline|changes, by: name, at: iso}. Forward-only; set by proposal-respond, cleared by proposal-send on (re)send.';
