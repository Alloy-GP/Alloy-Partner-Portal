import React from 'react';
import { getAnalytics } from '../lib/admin.js';

const { useState, useEffect } = React;

function relTime(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Card({ label, value }) {
  return (
    <div className="card card-pad" style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--alloy-purple)', lineHeight: 1.1, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAnalytics().then((r) => setData(r.analytics)).catch((e) => setError(String(e.message || e)));
  }, []);

  if (error) return <div className="card card-pad" style={{ color: 'var(--alloy-pink)', fontSize: 13 }}>Couldn’t load analytics. {error}</div>;
  if (!data) return <div className="card card-pad" style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Loading analytics…</div>;

  const { totals, perAccount, perUser = [], screens, daily } = data;
  const maxDay = Math.max(1, ...daily.map((d) => d.count));
  const maxScreen = Math.max(1, ...screens.map((s) => s.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card label="Active clients" value={totals.activeAccounts} />
        <Card label="Active users" value={totals.activeUsers} />
        <Card label="Logins" value={totals.logins} />
        <Card label="Screen views" value={totals.views} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: -8 }}>Last 30 days.</div>

      {/* Activity over time */}
      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}><span className="pip" />Activity (last 14 days)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {daily.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.count}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${Math.round((d.count / maxDay) * 100)}%`, minHeight: d.count ? 3 : 0, background: 'var(--alloy-purple)', borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-muted)', marginTop: 6 }}>
          <span>{daily[0]?.date.slice(5)}</span>
          <span>{daily[daily.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Per-client */}
      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}><span className="pip" />By client</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1.2fr', gap: 8, padding: '8px 14px', background: 'var(--alloy-off-white)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>
            <div>Client</div><div>Active / invited</div><div>Logins</div><div>Views</div><div>Last active</div>
          </div>
          {perAccount.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: 'var(--fg-muted)' }}>No activity yet.</div>
          ) : perAccount.map((p) => (
            <div key={p.account_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1.2fr', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 13, alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--alloy-purple)' }}>{p.name}</div>
              <div><strong>{p.users}</strong><span style={{ color: 'var(--fg-muted)' }}> / {p.invited || 0}</span></div>
              <div>{p.logins}</div><div>{p.views}</div>
              <div style={{ color: 'var(--fg-muted)' }}>{relTime(p.lastActive)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By person */}
      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}><span className="pip" />By person</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 1fr 1.2fr', gap: 8, padding: '8px 14px', background: 'var(--alloy-off-white)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>
            <div>Person</div><div>Client</div><div>Logins</div><div>Views</div><div>Last active</div>
          </div>
          {perUser.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: 'var(--fg-muted)' }}>No activity yet.</div>
          ) : perUser.map((u) => (
            <div key={u.user_id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 1fr 1.2fr', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 13, alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--alloy-purple)' }}>{u.name}</div>
              <div style={{ color: 'var(--fg-3)' }}>{u.account}</div>
              <div>{u.logins}</div><div>{u.views}</div>
              <div style={{ color: 'var(--fg-muted)' }}>{relTime(u.lastActive)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top screens */}
      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}><span className="pip" />Most-visited screens</div>
        {screens.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No views yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {screens.map((s) => (
              <div key={s.screen} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 90, fontSize: 12.5, color: 'var(--fg-3)', textTransform: 'capitalize' }}>{s.screen}</div>
                <div style={{ flex: 1, background: 'var(--alloy-off-white)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((s.count / maxScreen) * 100)}%`, height: 16, background: 'var(--alloy-pink)', borderRadius: 6 }} />
                </div>
                <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--alloy-purple)' }}>{s.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminAnalytics;
