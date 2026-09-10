import { describe, it, expect } from 'vitest';
import { summarizeWatchdog, describeAlert, rel, WATCHDOG_SOURCE, WATCHDOG_STALE_MS } from './syncMonitor.js';

const NOW = Date.parse('2026-09-09T20:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000, H = 60 * MIN;

describe('summarizeWatchdog', () => {
  it('reports a stale watchdog when there is no heartbeat at all', () => {
    const s = summarizeWatchdog({ runs: [], alerts: [], now: NOW });
    expect(s.watchdogStale).toBe(true);
    expect(s.lastCheckAt).toBeNull();
  });

  it('uses the newest monitor run as the heartbeat and tolerates harvest lag', () => {
    const runs = [
      { source: WATCHDOG_SOURCE, ok: true, started_at: ago(30 * MIN) },
      { source: WATCHDOG_SOURCE, ok: true, started_at: ago(20 * MIN) },
      { source: 'monday-daily', ok: true, started_at: ago(2 * MIN) },
    ];
    const s = summarizeWatchdog({ runs, alerts: [], now: NOW });
    expect(s.lastCheckAt).toBe(ago(20 * MIN));
    expect(s.watchdogStale).toBe(false);
  });

  it('flags the watchdog once its newest run is older than the window', () => {
    const runs = [{ source: WATCHDOG_SOURCE, ok: true, started_at: ago(WATCHDOG_STALE_MS + MIN) }];
    expect(summarizeWatchdog({ runs, alerts: [], now: NOW }).watchdogStale).toBe(true);
  });

  it('lists only failed runs from the last 24h, newest first, capped at 10', () => {
    const runs = [
      { source: 'a', ok: false, started_at: ago(25 * H) },        // too old
      { source: 'b', ok: true, started_at: ago(1 * H) },          // not a failure
      ...Array.from({ length: 12 }, (_, i) => ({ source: `f${i}`, ok: false, started_at: ago((i + 1) * MIN) })),
    ];
    const { failures } = summarizeWatchdog({ runs, alerts: [], now: NOW });
    expect(failures).toHaveLength(10);
    expect(failures[0].source).toBe('f0');
    expect(failures.every((r) => r.ok === false)).toBe(true);
    expect(failures.some((r) => r.source === 'a')).toBe(false);
  });

  it('shows only open alerts, oldest first', () => {
    const alerts = [
      { key: 'fail:x', kind: 'fail', source: 'x', first_seen: ago(1 * H), resolved_at: null },
      { key: 'stale:y', kind: 'stale', source: 'y', first_seen: ago(3 * H), resolved_at: null },
      { key: 'fail:z', kind: 'fail', source: 'z', first_seen: ago(5 * H), resolved_at: ago(4 * H) },
    ];
    const { open } = summarizeWatchdog({ runs: [], alerts, now: NOW });
    expect(open.map((a) => a.key)).toEqual(['stale:y', 'fail:x']);
  });
});

describe('describeAlert', () => {
  it('says failing with the error for a fail alert', () => {
    const a = { kind: 'fail', source: 'whatconverts-daily', first_seen: ago(2 * H), detail: { error: 'RISE: statement timeout' } };
    expect(describeAlert(a, NOW)).toBe('whatconverts-daily failing since 2h ago - RISE: statement timeout');
  });
  it('says silent and lists boards for a stale alert', () => {
    const a = { kind: 'stale', source: 'monday-boards', first_seen: ago(3 * H), detail: { boards: ['RISE (3h)', 'KC (3h)'] } };
    expect(describeAlert(a, NOW)).toBe('monday-boards silent since 3h ago - RISE (3h), KC (3h)');
  });
  it('calls out a flaky job with its failure ratio', () => {
    const a = { kind: 'fail', source: 'whatconverts-daily', first_seen: ago(5 * H),
      detail: { error: 'RISE: statement timeout', fails_recent: 5, runs_recent: 12, recent_hours: 6 } };
    expect(describeAlert(a, NOW)).toBe('whatconverts-daily failing since 5h ago (flaky: 5 of 12 runs failed in 6h) - RISE: statement timeout');
  });
  it('says when the problem is clear but the recovery hold is still running', () => {
    const a = { kind: 'fail', source: 'monday-daily', first_seen: ago(4 * H), clear_since: ago(40 * MIN), detail: { error: 'HTTP 504' } };
    expect(describeAlert(a, NOW)).toBe('monday-daily failing since 4h ago - HTTP 504; clear since 40m ago, resolving if it holds');
  });
  it('does not call a job flaky when every recent run failed', () => {
    const a = { kind: 'fail', source: 'x', first_seen: ago(H), detail: { error: 'HTTP 401', fails_recent: 4, runs_recent: 4 } };
    expect(describeAlert(a, NOW)).toBe('x failing since 1h ago - HTTP 401');
  });
});

describe('rel', () => {
  it('formats relative ages', () => {
    expect(rel(null, NOW)).toBe('never');
    expect(rel(ago(10 * 1000), NOW)).toBe('just now');
    expect(rel(ago(5 * MIN), NOW)).toBe('5m ago');
    expect(rel(ago(3 * H), NOW)).toBe('3h ago');
    expect(rel(ago(49 * H), NOW)).toBe('2d ago');
  });
});
