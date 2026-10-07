// @vitest-environment jsdom
// Renders the Sync Health card (table + Watchdog strip) against a stubbed
// Supabase client. A build proves JSX compiles; this proves the new strip
// renders real-shaped rows without throwing and says the right things.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const results = new Map();
function chain(table) {
  const c = {};
  for (const m of ['select', 'gte', 'lte', 'order', 'limit', 'is', 'eq', 'not']) c[m] = () => c;
  c.then = (res, rej) => Promise.resolve(results.get(table) ?? { data: [], error: null }).then(res, rej);
  return c;
}
vi.mock('../lib/supabase.js', () => ({ supabase: { from: (t) => chain(t) }, isSupabaseConfigured: true }));

const { default: SyncHealth } = await import('./SyncHealth.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms).toISOString();

async function render() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(React.createElement(SyncHealth)); });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
}

beforeEach(() => {
  results.clear();
  document.body.innerHTML = '';
  results.set('account_sync_health', { error: null, data: [
    { id: 'a1', company: 'CMGT', short_name: 'CMGT', has_monday: true, has_zendesk: true, has_wc: true, leads: 12, qualified: 3,
      projects: 152, services: 0, actions: 3, board_items: 170, synced_rows: 156, monday_synced_at: ago(2 * 60000), last_sync: ago(2 * 60000) },
  ] });
});

describe('SyncHealth watchdog strip', () => {
  it('shows a live heartbeat, the open alert and the failed run', async () => {
    results.set('sync_runs', { error: null, data: [
      { id: 1, source: 'sync-monitor-10min', started_at: ago(12 * 60000), ok: true, status_code: 200, error: null },
      { id: 2, source: 'whatconverts-daily', started_at: ago(14 * 60000), ok: false, status_code: 200, error: 'RISE: upsert: canceling statement due to statement timeout' },
      { id: 3, source: 'monday-daily', started_at: ago(14 * 60000), ok: true, status_code: 200, error: null },
    ] });
    results.set('sync_alerts', { error: null, data: [
      { key: 'fail:whatconverts-daily', kind: 'fail', source: 'whatconverts-daily', first_seen: ago(11 * 60000), last_notified_at: ago(11 * 60000), resolved_at: null,
        detail: { error: 'RISE: upsert: canceling statement due to statement timeout', status_code: 200 } },
    ] });
    const el = await render();
    const text = el.textContent;
    expect(text).toContain('CMGT');                       // the health table still renders
    expect(text).toContain('Watchdog');
    expect(text).toContain('checked 12m ago');
    expect(text).toContain('1 open alert');
    expect(text).toContain('whatconverts-daily failing since 11m ago - RISE: upsert');
    expect(text).toContain('1 failed run (24h)');
    expect(text).toContain('HTTP 200');
    expect(text).not.toContain('NOT being alerted');
  });

  it('screams when the watchdog itself has never checked in', async () => {
    results.set('sync_runs', { error: null, data: [] });
    results.set('sync_alerts', { error: null, data: [] });
    const el = await render();
    expect(el.textContent).toContain('no check since never');
    expect(el.textContent).toContain('staff are NOT being alerted');
    expect(el.textContent).toContain('no open alerts');
  });

  it('keeps the health table when the watchdog tables cannot be read', async () => {
    results.set('sync_runs', { error: new Error('permission denied for table sync_runs'), data: null });
    results.set('sync_alerts', { error: null, data: [] });
    const el = await render();
    expect(el.textContent).toContain('CMGT');
    expect(el.textContent).toContain('Couldn’t load watchdog: permission denied');
  });
});
