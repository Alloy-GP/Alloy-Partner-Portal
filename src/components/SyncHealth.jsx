import React from 'react';
import { supabase } from '../lib/supabase.js';

const { useState, useEffect } = React;

// Per-account sync health for staff: which integrations are mapped, how much
// data each produced, when it last synced, and a flag when something looks
// wrong (mapped but empty, or stale). Reads directly — staff RLS allows all.
// "Last sync" uses max(created_at): syncs delete-then-insert, so every row is
// re-stamped each run, making the newest row a reliable last-sync marker.

function rel(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
// Tightened from 36h: the Monday backstop cron now runs every 30 min, so a
// board that hasn't re-stamped in 2h is a genuine "sync stopped" signal.
const STALE_MS = 2 * 3600 * 1000;
// Drift = board has way more items than we synced. Threshold is BOTH an
// absolute floor (>50 missing) AND a ratio (<80% synced) so small,
// template/ticket-heavy boards (e.g. 38 items / 8 synced) don't false-flag,
// while a real under-sync (Tidewater 403 board / 13 synced) screams.
function isDrift(boardItems, syncedRows) {
  if (boardItems == null || syncedRows == null) return false;
  return (boardItems - syncedRows) > 50 && syncedRows < boardItems * 0.8;
}

function Cell({ ok, warn, children }) {
  const color = warn ? '#b03a3a' : ok ? '#2c8a6e' : 'var(--fg-muted)';
  return <td style={{ padding: '10px 12px', fontSize: 12.5, color, whiteSpace: 'nowrap' }}>{children}</td>;
}

export default function SyncHealth() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Server-side aggregated view (counts in SQL — no client row caps).
        const { data, error } = await supabase.from('account_sync_health').select('*');
        if (error) throw error;
        const out = (data || []).map((a) => ({
          id: a.id, name: a.company, short: a.short_name,
          monday: a.has_monday, zendesk: a.has_zendesk, wc: a.has_wc,
          leads: a.leads || 0, projects: a.projects || 0, services: a.services || 0, actions: a.actions || 0,
          qualified: a.qualified || 0, lastSync: a.last_sync || null,
          boardItems: a.board_items ?? null, syncedRows: a.synced_rows ?? null, mondaySync: a.monday_synced_at || null,
        })).sort((x, y) => String(x.name).localeCompare(String(y.name)));
        if (!cancelled) setRows(out);
      } catch (e) { if (!cancelled) setErr(String(e.message || e)); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) return <div className="card card-pad" style={{ color: '#b03a3a' }}>Couldn’t load sync health: {err}</div>;
  if (!rows) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading sync health…</div>;

  const th = { padding: '10px 12px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--alloy-purple)' }}>Sync health</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
          Per client: integrations mapped, data produced, last sync. <span style={{ color: '#b03a3a' }}>Red</span> = mapped but empty, <b>drift</b> (board has far more items than we synced), or stale (&gt;2h).
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={th}>Client</th>
              <th style={th}>Monday (proj · svc · act)</th>
              <th style={th}>WhatConverts (leads · qual)</th>
              <th style={th}>Zendesk</th>
              <th style={th}>Last sync</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mondayEmpty = r.monday && (r.projects + r.services + r.actions === 0);
              const drift = r.monday && isDrift(r.boardItems, r.syncedRows);
              const mondayStale = r.monday && r.mondaySync && (Date.now() - new Date(r.mondaySync).getTime() > STALE_MS);
              const mondayWarn = mondayEmpty || drift || mondayStale;
              const wcEmpty = r.wc && r.leads === 0;
              const stale = r.lastSync && (Date.now() - new Date(r.lastSync).getTime() > STALE_MS);
              // Build the Monday flag suffix (most-severe first): empty > drift > stale.
              const mondayFlag = !r.monday ? '' :
                mondayEmpty ? '  ⚠ empty' :
                drift ? `  ⚠ ${r.syncedRows}/${r.boardItems} synced` :
                mondayStale ? `  ⚠ ${rel(r.mondaySync)}` : '';
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--alloy-purple)', whiteSpace: 'nowrap' }}>{r.short || r.name}</td>
                  <Cell ok={r.monday && !mondayWarn} warn={mondayWarn}>
                    {r.monday ? `${r.projects} · ${r.services} · ${r.actions}${mondayFlag}` : '— not mapped'}
                  </Cell>
                  <Cell ok={r.wc && !wcEmpty} warn={wcEmpty}>
                    {r.wc ? `${r.leads} · ${r.qualified}${wcEmpty ? '  ⚠ empty' : ''}` : '— not mapped'}
                  </Cell>
                  <Cell ok={r.zendesk}>{r.zendesk ? 'mapped ✓' : '— not mapped'}</Cell>
                  <Cell warn={stale}>{rel(r.lastSync)}{stale ? '  ⚠' : ''}</Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
