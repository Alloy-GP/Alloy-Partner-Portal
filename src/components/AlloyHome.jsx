import React from 'react';
import { I } from './icons.jsx';
import { getPortfolio, snapshotQueue, approveSnapshot } from '../lib/admin.js';

const { useState, useEffect } = React;

function relTime(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function initials(name) {
  return (name || '').slice(0, 2).toUpperCase();
}

function Mark({ c }) {
  if (c.logo_url) {
    return <img src={c.logo_url} alt="" style={{ width: 38, height: 38, borderRadius: '22%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: 38, height: 38, borderRadius: '22%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>
      {initials(c.short_name || c.company)}
    </span>
  );
}

function Pill({ n, label, tone }) {
  if (!n) return null;
  const c = tone === 'pink' ? { bg: 'var(--alloy-pink-tint)', fg: 'var(--alloy-pink)' } : { bg: 'var(--alloy-yellow-tint)', fg: '#8a6900' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: c.bg, color: c.fg }}>
      {n} {label}
    </span>
  );
}

function SnapshotQueue({ onReview }) {
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => snapshotQueue().then(setQ).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!q) return null;
  const rows = (q.queue || []).filter((r) => r.draftId || (r.flags && r.flags.length));
  if (rows.length === 0) return null;

  const publish = async (id) => {
    setBusy(id);
    try { await approveSnapshot(id); await load(); } catch (e) { /* surfaced on the client screen */ } finally { setBusy(''); }
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 20, border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)' }}>Weekly snapshots</span>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {q.drafts} ready{q.flagged ? ` · ${q.flagged} need a look` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const flagged = r.flags && r.flags.length > 0;
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: flagged ? 'var(--alloy-yellow-tint)' : 'var(--alloy-off-white)', border: flagged ? '1px solid var(--alloy-yellow)' : '1px solid var(--border-subtle)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--alloy-purple)' }}>{r.name}</span>
                  {flagged ? <span title={r.flags.map((f) => f.msg).join(' ')} style={{ fontSize: 11.5 }}>⚠️</span> : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
                  {r.headline || `${r.shipped} shipped · ${r.leads} leads · ${r.waiting} waiting`}
                </div>
                {flagged ? <div style={{ fontSize: 11.5, color: '#8a6900', marginTop: 3 }}>{r.flags.map((f) => f.msg).join(' · ')}</div> : null}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fff', color: 'var(--fg-muted)', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                {r.status === 'draft' ? 'Draft' : r.status === 'published' ? 'Published' : '—'}
              </span>
              {r.draftId ? (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => onReview(r.id)} style={{ flexShrink: 0 }}>Review</button>
                  <button className="btn btn-primary btn-sm" onClick={() => publish(r.draftId)} disabled={busy === r.draftId} style={{ flexShrink: 0 }}>
                    {busy === r.draftId ? '…' : 'Publish'}
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => onReview(r.id)} style={{ flexShrink: 0 }}>Open</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlloyHome({ onEnter, onSignOut, onAdmin, onAddClient, onEditClient, onReviewSnapshot }) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPortfolio().then((r) => setClients(r.clients || [])).catch((e) => setError(String(e.message || e)));
  }, []);

  const totals = (clients || []).reduce((t, c) => ({
    open: t.open + c.openActions, past: t.past + c.pastDue, users: t.users + c.activeUsers,
  }), { open: 0, past: 0, users: 0 });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--alloy-off-white)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 28px', background: 'var(--alloy-purple-deep)', color: '#fff' }}>
        <img src="/alloy-icon.png" alt="Alloy" style={{ width: 30, height: 30, borderRadius: 7 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>Alloy — Client portfolio</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>All clients at a glance</div>
        </div>
        {onAdmin ? (
          <button onClick={onAdmin} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>
            Admin
          </button>
        ) : null}
        <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>
        {error ? <div style={{ color: 'var(--alloy-pink)', fontSize: 13 }}>Couldn’t load the portfolio. {error}</div> : null}
        {clients === null && !error ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Loading clients…</div> : null}

        {onReviewSnapshot ? <SnapshotQueue onReview={onReviewSnapshot} /> : null}

        {clients && clients.length > 0 ? (
          <>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {[
                { label: 'Clients', value: clients.length },
                { label: 'Open tickets', value: totals.open },
                { label: 'Past-due', value: totals.past },
                { label: 'Active users (30d)', value: totals.users },
              ].map((s) => (
                <div key={s.label} className="card card-pad" style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--alloy-purple)', marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Client cards */}
            <div className="col-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {clients.map((c) => {
                const needs = c.openActions + c.pastDue > 0;
                const pct = c.goal_target ? Math.round((c.goal_current / c.goal_target) * 100) : 0;
                return (
                  <button key={c.id} onClick={() => onEnter(c.id)} className="card card-pad"
                    style={{ textAlign: 'left', cursor: 'pointer', border: needs ? '1px solid var(--alloy-pink)' : '1px solid var(--border-subtle)', display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <Mark c={c} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)' }}>{c.short_name || c.company}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{c.tier || '—'} · active {relTime(c.lastActive)}</div>
                      </div>
                      {onEditClient ? (
                        <span role="button" tabIndex={0} title="Edit client" aria-label="Edit client"
                          onClick={(e) => { e.stopPropagation(); onEditClient(c.id); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEditClient(c.id); } }}
                          style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7, color: 'var(--fg-muted)', cursor: 'pointer' }}>
                          <I.Edit width={15} height={15} />
                        </span>
                      ) : null}
                      <span aria-hidden="true" style={{ color: 'var(--fg-muted)' }}>→</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, minHeight: 22 }}>
                      <Pill n={c.openActions} label={c.openActions === 1 ? 'open ticket' : 'open tickets'} tone="pink" />
                      <Pill n={c.pastDue} label="past-due" tone="yellow" />
                      {!needs ? <span style={{ fontSize: 11, fontWeight: 600, color: '#2c8a6e' }}>On track</span> : null}
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{c.goal_current} / {c.goal_target} {c.goal_label}</span>
                      <span>{c.activeUsers} / {c.invited} users</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--alloy-off-white)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--alloy-purple)' }} />
                    </div>
                  </button>
                );
              })}
              {onAddClient ? (
                <button onClick={onAddClient} className="card card-pad"
                  style={{ cursor: 'pointer', border: '1.5px dashed var(--border-subtle)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 150, color: 'var(--alloy-purple)' }}>
                  <span style={{ width: 38, height: 38, borderRadius: '22%', display: 'grid', placeItems: 'center', background: 'var(--alloy-purple-tint)' }}>
                    <I.Plus width={18} height={18} />
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>Add client</span>
                </button>
              ) : null}
            </div>
          </>
        ) : (clients && clients.length === 0 && !error ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
            No clients yet.{' '}
            {onAddClient ? <button onClick={onAddClient} className="btn btn-primary btn-sm" style={{ marginLeft: 6 }}><I.Plus width={12} height={12} /> Add client</button> : null}
          </div>
        ) : null)}
      </div>
    </div>
  );
}

export default AlloyHome;
