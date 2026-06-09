import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { listSnapshots, updateSnapshot, approveSnapshot, regenerateSnapshot } from '../lib/admin.js';

const { useState, useEffect } = React;

function groupItems(items) {
  const g = { completed: [], upcoming: [], waiting: [], lead: [] };
  (items || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .forEach((it) => { (g[it.kind] || (g[it.kind] = [])).push({ text: it.text, meta: it.meta }); });
  return g;
}

function Stat({ value, label, tone }) {
  const c = tone === 'pink' ? 'var(--alloy-pink)' : tone === 'green' ? '#2c8a6e' : 'var(--alloy-purple)';
  return (
    <div className="card card-pad" style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: c, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Section({ title, items, empty }) {
  if (!items || items.length === 0) {
    if (!empty) return null;
    return (
      <div style={{ marginBottom: 22 }}>
        <SectionHead title={title} count={0} />
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '4px 2px' }}>{empty}</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 22 }}>
      <SectionHead title={title} count={items.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((it, i) => (
          <div key={i} className="card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 13.5, color: 'var(--fg-3)', fontWeight: 600, flex: 1 }}>{it.text}</span>
            {it.meta ? <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', flexShrink: 0 }}>{it.meta}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHead({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, paddingBottom: 9, borderBottom: '2px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--alloy-purple)', flex: 1 }}>{title}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', background: 'var(--alloy-off-white)', borderRadius: 999, padding: '2px 9px' }}>{count}</span>
    </div>
  );
}

function SnapshotBody({ v }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--alloy-pink)' }}>{v.weekLabel || 'Weekly snapshot'}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--alloy-purple)', marginTop: 6, lineHeight: 1.25 }}>
          {v.headline || 'Your week at a glance'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat value={v.summary.completed} label="Shipped" tone="green" />
        <Stat value={v.summary.leads + (v.summary.leadsValue ? ` · ${v.summary.leadsValue}` : '')} label="New leads" tone="purple" />
        <Stat value={v.summary.waiting} label="Waiting on you" tone="pink" />
      </div>

      <Section title="Shipped this week" items={v.completed} empty="Nothing wrapped up this week — plenty in motion below." />
      <Section title="In motion" items={v.upcoming} />
      <Section title="New leads" items={v.lead} />
      <Section title="Waiting on you" items={v.waiting} empty="You're all caught up — nothing needs you right now." />

      {v.note ? (
        <div className="card card-pad" style={{ background: 'var(--alloy-purple-tint)', border: 'none', marginTop: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--alloy-purple)', marginBottom: 5 }}>A note from your Alloy team</div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{v.note}</div>
        </div>
      ) : null}
    </div>
  );
}

function SnapshotScreen() {
  const isStaff = !!(DATA.user && DATA.user.isStaff);
  const published = DATA.weeklySnapshot;
  const [draft, setDraft] = useState(null);
  const [headline, setHeadline] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!isStaff || !DATA.account?.id) return;
    listSnapshots(DATA.account.id)
      .then((r) => {
        const d = (r.snapshots || []).find((s) => s.status === 'draft');
        if (d) { setDraft(d); setHeadline(d.headline || ''); setNote(d.note || ''); }
      })
      .catch(() => {});
  }, []);

  const view = draft
    ? { weekLabel: draft.week_label, headline, note, isDraft: true,
        summary: { completed: draft.summary_completed || 0, waiting: draft.summary_waiting || 0, leads: draft.summary_leads || 0, leadsValue: draft.leads_value || '' },
        ...groupItems(draft.weekly_snapshot_items) }
    : (published && published.weekLabel)
    ? { weekLabel: published.weekLabel, headline: published.headline, note: published.note, isDraft: false,
        summary: published.summary,
        completed: published.completed, upcoming: published.upcoming, waiting: published.waiting, lead: published.lead || [] }
    : null;

  const save = async () => { setBusy(true); setMsg(''); try { await updateSnapshot(draft.id, { headline, note }); setMsg('Saved.'); } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); } };

  // Pull the latest Monday data into the draft (keeps the headline + note).
  const refresh = async () => {
    setBusy(true); setMsg('Refreshing from Monday…');
    try {
      await updateSnapshot(draft.id, { headline, note }); // persist edits before regen carries them over
      await regenerateSnapshot(DATA.account.id);
      const r = await listSnapshots(DATA.account.id);
      const d = (r.snapshots || []).find((s) => s.status === 'draft');
      if (d) { setDraft(d); setHeadline(d.headline || ''); setNote(d.note || ''); }
      setMsg('Refreshed with the latest data.');
    } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true); setMsg('');
    try {
      await updateSnapshot(draft.id, { headline, note });
      const res = await approveSnapshot(draft.id);
      const e = res && res.email;
      setMsg(e && e.sent > 0
        ? `Published & emailed to ${e.sent} ${e.sent === 1 ? 'person' : 'people'}.`
        : `Published — live for the client.${e && e.error ? ` (No email: ${e.error})` : ''}`);
      setDraft(null);
    } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div className="content" data-screen-label="Weekly snapshot">
      {/* Staff review bar */}
      {isStaff && draft ? (
        <div className="card card-pad" style={{ marginBottom: 20, border: '1px solid var(--alloy-yellow)', background: 'var(--alloy-yellow-tint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: '#8a6900' }}>Draft — not sent yet</span>
            <span style={{ fontSize: 12, color: '#8a6900' }}>Review, tweak the headline/note, then publish — it emails the client's portal users.</span>
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 4 }}>Headline</span>
            <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 4 }}>Note to the client (optional)</span>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A personal line — what to celebrate, what's next…" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={busy} title="Re-pull the latest Monday data into this draft">↻ Refresh from latest</button>
            <button className="btn btn-secondary btn-sm" onClick={save} disabled={busy}>Save draft</button>
            <button className="btn btn-primary btn-sm" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish & send'}</button>
            {msg ? <span style={{ fontSize: 12.5, color: '#8a6900', fontWeight: 600 }}>{msg}</span> : null}
          </div>
        </div>
      ) : null}

      {isStaff && !draft && msg ? (
        <div className="card card-pad" style={{ marginBottom: 20, background: 'var(--alloy-purple-tint)', border: 'none', fontSize: 13, color: 'var(--alloy-purple)', fontWeight: 600 }}>{msg}</div>
      ) : null}

      {view ? <SnapshotBody v={view} /> : (
        <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 14 }}>
          Your first weekly snapshot is on its way — it lands here every Friday.
        </div>
      )}
    </div>
  );
}

export default SnapshotScreen;
