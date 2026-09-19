// Pure helpers behind the Sync Health "watchdog" strip. Kept out of the
// component so the decisions (is the watchdog itself alive? which failures and
// alerts to show?) are unit-tested rather than eyeballed.
//
// Data model (see 20260909210000_sync_monitor.sql):
//   sync_runs   - one row per cron-fired sync request, classified ok/failed by
//                 the sync-monitor edge function when it harvests pg_net results.
//   sync_alerts - open (resolved_at null) / resolved problems the monitor emails.
// The monitor's own cron job is harvested like any other, so its newest run row
// is the heartbeat. Harvest lags a run by 10-20 min, hence the generous window.

export const WATCHDOG_SOURCE = 'sync-monitor-10min';
export const WATCHDOG_STALE_MS = 45 * 60 * 1000;
export const FAILURE_WINDOW_MS = 24 * 3600 * 1000;

export function rel(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ts = (iso) => (iso ? new Date(iso).getTime() : 0);

export function summarizeWatchdog({ runs = [], alerts = [], now = Date.now() } = {}) {
  const heartbeat = runs
    .filter((r) => r.source === WATCHDOG_SOURCE)
    .reduce((best, r) => (!best || ts(r.started_at) > ts(best.started_at) ? r : best), null);
  const lastCheckAt = heartbeat ? heartbeat.started_at : null;
  const watchdogStale = !lastCheckAt || now - ts(lastCheckAt) > WATCHDOG_STALE_MS;

  const failures = runs
    .filter((r) => r.ok === false && now - ts(r.started_at) < FAILURE_WINDOW_MS)
    .sort((a, b) => ts(b.started_at) - ts(a.started_at))
    .slice(0, 10);

  const open = alerts
    .filter((a) => !a.resolved_at)
    .sort((a, b) => ts(a.first_seen) - ts(b.first_seen));

  return { lastCheckAt, watchdogStale, failures, open };
}

// One-line, human label for an alert row: "monday-daily failing since 3h ago".
// A flaky job (fails some ticks, passes others) says so with the ratio, and
// an alert that is currently clear but inside its recovery hold says that too.
export function describeAlert(a, now = Date.now()) {
  const d = a.detail || {};
  const verb = a.kind === 'stale' ? 'silent' : 'failing';
  const since = rel(a.first_seen, now);
  const err = d.error || (Array.isArray(d.boards) ? d.boards.join(', ') : '');
  const flaky = d.fails_recent != null && d.runs_recent != null && d.fails_recent < d.runs_recent
    ? ` (flaky: ${d.fails_recent} of ${d.runs_recent} runs failed in ${d.recent_hours || 6}h)` : '';
  const holding = a.clear_since ? `; clear since ${rel(a.clear_since, now)}, resolving if it holds` : '';
  return `${a.source} ${verb} since ${since}${flaky}${err ? ` - ${err}` : ''}${holding}`;
}
