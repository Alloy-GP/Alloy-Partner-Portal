import { describe, it, expect } from 'vitest';
import { aggregateWatch } from './proposalMockData.js';

// proposal_events is append-only across sends. A proposal can be sent, demoted,
// reworked and sent again, so the panel must describe ONE send — otherwise the
// first round's opens get reported as though they came from the latest one.
const ev = (over) => ({
  id: Math.random(), proposal_id: 'p1', viewer_key: 'v1', viewer_name: 'Nina Patel',
  event_type: 'open', section_name: '', pct: 0, ms: 0, ...over,
});

const FIRST_SEND = '2026-06-01T10:00:00Z';
const SECOND_SEND = '2026-07-01T10:00:00Z';

const round1 = [
  ev({ created_at: '2026-06-02T10:00:00Z', event_type: 'open' }),
  ev({ created_at: '2026-06-02T10:05:00Z', event_type: 'section', section_name: 'Pricing tiers', pct: 90, ms: 40000 }),
  ev({ created_at: '2026-06-03T10:00:00Z', event_type: 'open' }),
];
const round2 = [
  ev({ created_at: '2026-07-02T10:00:00Z', event_type: 'open', viewer_key: 'v2', viewer_name: 'Ray Okafor' }),
  ev({ created_at: '2026-07-02T10:03:00Z', event_type: 'section', section_name: 'Cover & intro', pct: 100, ms: 12000, viewer_key: 'v2', viewer_name: 'Ray Okafor' }),
];

describe('aggregateWatch — scoped to the current send', () => {
  it('counts only events at or after sent_at', () => {
    const w = aggregateWatch([...round1, ...round2], { sentAt: SECOND_SEND });
    expect(w.opens).toBe(1);                 // not 3
    expect(w.viewers).toHaveLength(1);       // Ray only, not Nina
    expect(w.viewers[0].name).toBe('Ray Okafor');
    expect(w.sections.map((s) => s.name)).toEqual(['Cover & intro']);
  });

  it('reports what it excluded so the UI can tag it', () => {
    const w = aggregateWatch([...round1, ...round2], { sentAt: SECOND_SEND });
    expect(w.round.priorEvents).toBe(3);
    expect(w.round.priorOpens).toBe(2);
    expect(w.round.since).toBe(SECOND_SEND);
  });

  it('excludes nothing, and flags nothing, when every event is from this send', () => {
    const w = aggregateWatch(round2, { sentAt: SECOND_SEND });
    expect(w.opens).toBe(1);
    expect(w.round.priorEvents).toBe(0);
    expect(w.round.priorOpens).toBe(0);
  });

  it('counts everything on the FIRST send, where nothing is prior', () => {
    const w = aggregateWatch(round1, { sentAt: FIRST_SEND });
    expect(w.opens).toBe(2);
    expect(w.round.priorEvents).toBe(0);
  });

  // The case that used to read as healthy engagement: re-sent, nobody has opened
  // the new one yet, but three events sit in the table from the previous round.
  it('reports a re-sent proposal with no new engagement as not opened since this send', () => {
    const w = aggregateWatch(round1, { sentAt: SECOND_SEND });
    expect(w.opens).toBe(0);
    expect(w.viewers).toEqual([]);
    expect(w.sections).toEqual([]);
    expect(w.lastOpened).toBe('Not opened since this send');
    expect(w.round.priorEvents).toBe(3);
    expect(w.round.priorOpens).toBe(2);
    expect(w.heat).toBe('new');
    // Still reports the real send + link window rather than a blank slate.
    expect(w.sentOn).toBeTruthy();
    expect(w.linkLife).toBe(30);
  });

  it('keeps every event when there is no sent_at to scope to', () => {
    // Marked sent by hand: there is no round. That row renders in the untracked
    // bucket anyway, but aggregateWatch must not divide by a null cutoff.
    const w = aggregateWatch([...round1, ...round2], { sentAt: null });
    expect(w.opens).toBe(3);
    expect(w.round.priorEvents).toBe(0);
  });

  it('returns null with no events at all', () => {
    expect(aggregateWatch([], { sentAt: SECOND_SEND })).toBe(null);
    expect(aggregateWatch(null, { sentAt: SECOND_SEND })).toBe(null);
  });

  it('scopes the board verdict to this send too', () => {
    const declineOld = ev({ created_at: '2026-06-04T10:00:00Z', event_type: 'cta', section_name: 'Declined', meta: { action: 'decline' } });
    const w = aggregateWatch([...round1, declineOld, ...round2], { sentAt: SECOND_SEND });
    // A verdict from the previous round must not present as the current answer.
    expect(w.response).toBe(null);
  });

  it('includes an event landing exactly on the send timestamp', () => {
    const exact = ev({ created_at: SECOND_SEND, event_type: 'open' });
    const w = aggregateWatch([...round1, exact], { sentAt: SECOND_SEND });
    expect(w.opens).toBe(1);
    expect(w.round.priorEvents).toBe(3);
  });
});
