import { describe, it, expect } from 'vitest';
import { parseReceivedText, receivedMs, fmtReceived, ageAgo, agePriority } from './leadAge.js';

const NOW = Date.parse('2026-08-11T16:00:00Z');
const ago = (ms) => NOW - ms;
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

describe('parseReceivedText', () => {
  it('parses all three separators the codebase has written', () => {
    const expected = Date.parse('2026-05-21T09:42:00');
    expect(parseReceivedText('May 21, 2026 · 9:42 AM')).toBe(expected); // mock pipeline
    expect(parseReceivedText('May 21, 2026 at 9:42 AM')).toBe(expected); // live intake
    expect(parseReceivedText('May 21, 2026 * 9:42 AM')).toBe(expected); // reset-demo
  });

  it('returns null for empty or unparseable input', () => {
    for (const v of ['', '   ', null, undefined, 'sometime last week', 'intake']) {
      expect(parseReceivedText(v)).toBeNull();
    }
  });
});

describe('receivedMs — fallback chain', () => {
  it('prefers the real received_at column', () => {
    const sub = { receivedAt: '2026-07-07T23:47:15Z', received: 'May 21, 2026 · 9:42 AM', arrivedAt: '2026-08-11T16:10:00Z' };
    expect(receivedMs(sub)).toBe(Date.parse('2026-07-07T23:47:15Z'));
  });

  it('falls back to the legacy display string when the column is null', () => {
    const sub = { receivedAt: null, received: 'May 21, 2026 · 9:42 AM', arrivedAt: '2026-08-11T16:10:00Z' };
    expect(receivedMs(sub)).toBe(Date.parse('2026-05-21T09:42:00'));
  });

  it('falls back to mint time only when nothing better exists', () => {
    expect(receivedMs({ arrivedAt: '2026-08-11T16:10:00Z' })).toBe(Date.parse('2026-08-11T16:10:00Z'));
  });

  it('is null when the row carries no usable timestamp at all', () => {
    expect(receivedMs({})).toBeNull();
    expect(receivedMs(null)).toBeNull();
    expect(receivedMs({ receivedAt: 'not-a-date', received: 'nope', arrivedAt: '' })).toBeNull();
  });

  it('ignores a garbage received_at and uses the next source', () => {
    expect(receivedMs({ receivedAt: 'garbage', received: 'May 21, 2026 · 9:42 AM' }))
      .toBe(Date.parse('2026-05-21T09:42:00'));
  });
});

describe('ageAgo — always relative', () => {
  it('covers each bucket', () => {
    expect(ageAgo(ago(30 * 1000), NOW)).toBe('just now');
    expect(ageAgo(ago(5 * MIN), NOW)).toBe('5m ago');
    expect(ageAgo(ago(59 * MIN), NOW)).toBe('59m ago');
    expect(ageAgo(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(ageAgo(ago(23 * HOUR), NOW)).toBe('23h ago');
    expect(ageAgo(ago(1 * DAY), NOW)).toBe('yesterday');
    expect(ageAgo(ago(6 * DAY), NOW)).toBe('6d ago');
    expect(ageAgo(ago(29 * DAY), NOW)).toBe('29d ago');
    expect(ageAgo(ago(35 * DAY), NOW)).toBe('1mo ago');
    expect(ageAgo(ago(400 * DAY), NOW)).toBe('1y ago');
  });

  it('never degrades to a date, even past a week (the whole point)', () => {
    // relAgo() in the cockpit returns "Jul 7" here; this must stay an age so the
    // card doesn't print the same date twice.
    expect(ageAgo(ago(35 * DAY), NOW)).toMatch(/ago$/);
    expect(ageAgo(ago(200 * DAY), NOW)).toMatch(/ago$/);
  });

  it('treats future timestamps as "just now" rather than negative ages', () => {
    expect(ageAgo(NOW + 5 * MIN, NOW)).toBe('just now');
  });

  it('is empty for a missing timestamp', () => {
    expect(ageAgo(null, NOW)).toBe('');
  });

  it('reflects the real bug: a month-old lead minted today reads as month-old', () => {
    const trueReceived = Date.parse('2026-07-07T23:47:15Z');
    const mintedToday = Date.parse('2026-08-11T16:11:14Z');
    expect(ageAgo(receivedMs({ receivedAt: '2026-07-07T23:47:15Z' }), NOW)).toBe('1mo ago');
    // The old behavior, for contrast — mint time makes it look brand new.
    expect(ageAgo(mintedToday, NOW)).toBe('just now');
    expect(trueReceived).toBeLessThan(mintedToday);
  });
});

describe('fmtReceived', () => {
  it('omits the year in the current year and includes it otherwise', () => {
    const sameYear = fmtReceived(Date.parse('2026-07-07T18:47:00Z'), { now: NOW, timeZone: 'UTC' });
    expect(sameYear).toBe('Jul 7, 6:47 PM');
    const priorYear = fmtReceived(Date.parse('2025-12-30T09:05:00Z'), { now: NOW, timeZone: 'UTC' });
    expect(priorYear).toContain('2025');
    expect(priorYear).toContain('Dec 30');
  });

  it('is empty for a missing or invalid timestamp', () => {
    expect(fmtReceived(null)).toBe('');
    expect(fmtReceived(Number.NaN)).toBe('');
  });
});

describe('agePriority', () => {
  it('buckets by staleness', () => {
    expect(agePriority(ago(2 * HOUR), NOW)).toBe('fresh');
    expect(agePriority(ago(3 * DAY), NOW)).toBe('aging');
    expect(agePriority(ago(20 * DAY), NOW)).toBe('stale');
  });
  it('defaults to fresh when unknown', () => {
    expect(agePriority(null, NOW)).toBe('fresh');
  });
});
