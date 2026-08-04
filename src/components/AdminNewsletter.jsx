import React from 'react';
import { I } from './icons.jsx';
import {
  listNewsletterRequests, openNewsletterRound, closeNewsletterRequest, deleteNewsletterRequest,
} from '../lib/admin.js';

const { useState, useEffect } = React;

const ZD_BASE = 'https://alloycreatives.zendesk.com/agent/tickets/';

const STATUS = {
  open: { label: 'Open · waiting', bg: 'var(--alloy-pink-tint)', fg: 'var(--alloy-pink)' },
  submitted: { label: 'Submitted', bg: 'var(--alloy-green-tint)', fg: 'var(--dark-green, #2c6e62)' },
  closed: { label: 'Closed', bg: 'var(--alloy-off-white)', fg: 'var(--fg-muted)' },
};

function defaultTitle() {
  try {
    return `${new Date().toLocaleDateString(undefined, { month: 'long' })} Newsletter`;
  } catch { return 'Newsletter'; }
}

function fmtDate(s) {
  if (!s) return '';
  // Date-only strings (due_date, 'YYYY-MM-DD') parse as UTC midnight and can
  // render a day early in negative-offset zones — pin them to local midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; }
}

// Submitted answers, rendered read-only for staff.
function Submission({ sub }) {
  if (!sub) return null;
  const row = (label, val) => (val && String(val).trim() ? (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{val}</div>
    </div>
  ) : null);
  const links = (sub.links || []).filter((l) => l && l.url);
  const atts = sub.attachments || [];
  return (
    <div style={{ background: 'var(--alloy-off-white)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
      {row("What's happening", sub.highlights)}
      {row('To feature', sub.feature)}
      {row('Call to action', sub.cta)}
      {links.length ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 2 }}>Links</div>
          {links.map((l, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--alloy-purple)' }}>{l.label ? `${l.label} — ` : ''}{l.url}</a>
            </div>
          ))}
        </div>
      ) : null}
      {atts.length ? row('Attachments', atts.join(', ')) : null}
      {row('Anything else', sub.notes)}
    </div>
  );
}

export default function AdminNewsletter() {
  const [data, setData] = useState(null); // { requests, accounts }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState({});

  // "Open a round" form
  const [title, setTitle] = useState(defaultTitle());
  const [due, setDue] = useState('');
  const [picked, setPicked] = useState({}); // account_id -> bool

  const load = async () => {
    try {
      const res = await listNewsletterRequests();
      setData({ requests: res.requests || [], accounts: res.accounts || [] });
    } catch (e) { setError(String(e.message || e)); setData({ requests: [], accounts: [] }); }
  };
  useEffect(() => { load(); }, []);

  if (error && !data) return <div className="card card-pad" style={{ color: 'var(--alloy-pink)' }}>{error}</div>;
  if (!data) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading…</div>;

  const { requests, accounts } = data;
  // Accounts that already have a live (open/submitted) round → can't re-open.
  const liveByAccount = {};
  requests.forEach((r) => { if (r.status !== 'closed') liveByAccount[r.account_id] = r; });

  const selectable = accounts.filter((a) => !liveByAccount[a.id]);
  const allSelected = selectable.length > 0 && selectable.every((a) => picked[a.id]);
  const pickedCount = selectable.filter((a) => picked[a.id]).length;

  const toggle = (id) => setPicked((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = () => {
    if (allSelected) setPicked({});
    else { const next = {}; selectable.forEach((a) => { next[a.id] = true; }); setPicked(next); }
  };

  const openRound = async () => {
    const ids = selectable.filter((a) => picked[a.id]).map((a) => a.id);
    if (!ids.length) { setError('Pick at least one client.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await openNewsletterRound(ids, title.trim() || 'Newsletter', due || null);
      setNotice(`Opened for ${res.opened} client${res.opened === 1 ? '' : 's'}${res.skipped ? ` · ${res.skipped} skipped (already had a live round)` : ''}.`);
      setPicked({});
      await load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const close = async (id) => {
    setBusy(true); setError('');
    try { await closeNewsletterRequest(id); await load(); }
    catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const del = async (id) => {
    if (!window.confirm('Delete this newsletter request? This removes it and any recorded submission.')) return;
    setBusy(true); setError('');
    try { await deleteNewsletterRequest(id); await load(); }
    catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const open = requests.filter((r) => r.status === 'open');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const closed = requests.filter((r) => r.status === 'closed');

  const StatusPill = ({ s }) => {
    const st = STATUS[s] || STATUS.closed;
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>;
  };

  const Row = ({ r }) => {
    const isOpen = !!expanded[r.id];
    const a = r.analytics || { opens: 0, openerCount: 0, openers: [] };
    const filledOut = r.status === 'submitted' || (a.submits || 0) > 0;
    // Show the expand toggle when there's a submission OR opener detail to see.
    const hasDetail = !!r.submission || (a.openers && a.openers.length > 0);
    return (
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--alloy-purple)' }}>{r.account_name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
              {r.title}{r.due_date ? ` · due ${fmtDate(r.due_date)}` : ''}
              {r.submitted_at ? ` · submitted ${fmtDate(r.submitted_at)}${r.submitted_by ? ` by ${r.submitted_by}` : ''}` : ''}
            </div>
            {/* Engagement analytics */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
              <span title={`${a.opens || 0} total clicks on "Open Form"`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: a.opens ? 'rgba(75,134,180,0.12)' : 'var(--alloy-off-white)', color: a.opens ? '#3a6f96' : 'var(--fg-muted)' }}>
                <I.Eye width={12} height={12} /> {a.opens ? `Opened ${a.opens}× · ${a.openerCount} ${a.openerCount === 1 ? 'person' : 'people'}` : 'Not opened yet'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: filledOut ? 'var(--alloy-green-tint)' : 'var(--alloy-off-white)', color: filledOut ? 'var(--dark-green, #2c6e62)' : 'var(--fg-muted)' }}>
                <I.Check width={12} height={12} /> {filledOut ? 'Filled out' : 'Not submitted'}
              </span>
            </div>
          </div>
          <StatusPill s={r.status} />
          {r.zendesk_ticket_id ? (
            <a className="btn btn-ghost btn-sm" href={`${ZD_BASE}${r.zendesk_ticket_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--alloy-purple)' }}>Ticket ↗</a>
          ) : null}
          {hasDetail ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}>{isOpen ? 'Hide' : 'View'}</button>
          ) : null}
          {r.status !== 'closed' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => close(r.id)} disabled={busy}>Close</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => del(r.id)} disabled={busy} style={{ color: 'var(--alloy-pink)' }}>Delete</button>
          )}
        </div>
        {isOpen && hasDetail ? (
          <div style={{ padding: '0 14px 14px' }}>
            {a.openers && a.openers.length ? (
              <div style={{ background: 'var(--alloy-off-white)', borderRadius: 10, padding: '10px 14px', marginTop: 4, marginBottom: r.submission ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 6 }}>Who opened it</div>
                {a.openers.map((o, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--fg)', padding: '2px 0' }}>
                    <span>{o.name}</span>
                    <span style={{ color: 'var(--fg-muted)' }}>{o.count} {o.count === 1 ? 'open' : 'opens'}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {r.submission ? <Submission sub={r.submission} /> : null}
          </div>
        ) : null}
      </div>
    );
  };

  const Section = ({ label, rows }) => rows.length ? (
    <div className="card" style={{ padding: 0, marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>{label} · {rows.length}</div>
      {rows.map((r) => <Row key={r.id} r={r} />)}
    </div>
  ) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Open a round */}
      <div className="card card-pad" style={{ alignSelf: 'start' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)', marginBottom: 4 }}>Open a newsletter round</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14 }}>Pick who sees the intake form this round. Each selected client gets a banner until they submit.</div>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 }}>Round title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="August 2026 Newsletter" style={{ width: '100%', boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 }}>Due date (optional)</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', flex: 1 }}>Clients ({pickedCount} selected)</span>
          {selectable.length ? <button className="btn btn-ghost btn-sm" onClick={toggleAll}>{allSelected ? 'Clear' : 'Select all'}</button> : null}
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, maxHeight: 320, overflowY: 'auto' }}>
          {accounts.map((a) => {
            const live = liveByAccount[a.id];
            return (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)', cursor: live ? 'default' : 'pointer', opacity: live ? 0.55 : 1 }}
                title={live ? `Already has a live round (${live.status})` : ''}>
                <input type="checkbox" disabled={!!live} checked={!!picked[a.id]} onChange={() => toggle(a.id)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{a.short_name || a.company}</span>
                  {live ? <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{live.status === 'submitted' ? 'Submitted' : 'Round open'}</span> : null}
                </span>
              </label>
            );
          })}
          {accounts.length === 0 ? <div style={{ padding: 12, fontSize: 12.5, color: 'var(--fg-muted)' }}>No clients yet.</div> : null}
        </div>

        <button className="btn btn-primary" onClick={openRound} disabled={busy || !pickedCount} style={{ marginTop: 12, width: '100%' }}>
          {busy ? 'Opening…' : `Open round for ${pickedCount || 0} client${pickedCount === 1 ? '' : 's'}`}
        </button>
        {notice ? <div style={{ marginTop: 10, background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{notice}</div> : null}
        {error ? <div style={{ marginTop: 10, background: 'var(--alloy-pink-tint)', color: 'var(--alloy-pink)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{error}</div> : null}
      </div>

      {/* Tracker */}
      <div>
        {requests.length === 0 ? (
          <div className="card card-pad" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No newsletter rounds yet. Open one on the left to get started.</div>
        ) : (
          <>
            <Section label="Waiting on the client" rows={open} />
            <Section label="Submitted — ready to build" rows={submitted} />
            <Section label="Closed" rows={closed} />
          </>
        )}
      </div>
    </div>
  );
}
