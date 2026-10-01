import React from 'react';
import { I } from './icons.jsx';
import { onboardingOverview, startOnboarding, resetOnboarding, completeOnboarding, removeOnboarding } from '../lib/admin.js';
import { templateRows, missingTemplateItems, TEMPLATE } from '../lib/onboarding.js';

const { useState, useEffect } = React;

// Admin → Onboarding. One row per client: start the checklist (new clients get
// it automatically from the New client form), watch progress + stuck items,
// top up with new template items, mark complete, or reset. "Open" jumps into
// the client's own Onboarding page in staff view (the Alloy confirm column).

function relTime(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const nameOf = (c) => c.short_name || c.company;

function Mark({ c }) {
  if (c.logo_url) return <img src={c.logo_url} alt="" style={{ width: 34, height: 34, borderRadius: '22%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <span style={{ width: 34, height: 34, borderRadius: '22%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5 }}>
      {(nameOf(c) || '').slice(0, 2).toUpperCase()}
    </span>
  );
}

function Pill({ children, tone }) {
  const t = tone === 'pink' ? { bg: 'var(--alloy-pink-tint)', fg: 'var(--alloy-pink)' }
    : tone === 'green' ? { bg: 'var(--alloy-green-tint)', fg: '#2c6e62' }
    : tone === 'purple' ? { bg: 'var(--alloy-purple-tint)', fg: 'var(--alloy-purple)' }
    : { bg: 'var(--alloy-off-white)', fg: 'var(--fg-muted)' };
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{children}</span>;
}

export default function AdminOnboarding({ go }) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const r = await onboardingOverview();
      setClients((r.clients || []).filter((c) => c.tier !== 'internal'));
    } catch (e) { setError(String(e.message || e)); setClients([]); }
  };
  useEffect(() => { load(); }, []);

  const run = async (id, fn, msg) => {
    setBusy(id); setError(''); setNotice('');
    try {
      const r = await fn();
      if (msg) setNotice(typeof msg === 'function' ? msg(r) : msg);
      await load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(''); }
  };
  const start = (c) => run(c.id, () => startOnboarding(c.id, templateRows()), (r) => `Checklist started for ${nameOf(c)} — ${r.inserted} items. It’s live in their portal now.`);
  const addMissing = (c, n) => run(c.id, () => startOnboarding(c.id, templateRows()), `Added ${n} new ${n === 1 ? 'item' : 'items'} to ${nameOf(c)}’s checklist.`);
  const complete = (c, done) => run(c.id, () => completeOnboarding(c.id, done), done ? `${nameOf(c)} marked complete.` : `${nameOf(c)} reopened.`);
  const reset = (c) => {
    if (!window.confirm(`Reset ${nameOf(c)}’s checklist?\n\nEvery status, contact and credential they entered is erased and a fresh checklist is created. This cannot be undone.`)) return;
    run(c.id, () => resetOnboarding(c.id, templateRows()), `${nameOf(c)}’s checklist was reset.`);
  };
  const remove = (c) => {
    if (!window.confirm(`Remove ${nameOf(c)}’s checklist entirely?\n\nThe Onboarding page disappears from their portal and everything they entered is deleted.`)) return;
    run(c.id, () => removeOnboarding(c.id), `${nameOf(c)}’s checklist was removed.`);
  };

  if (error && !clients) return <div className="card card-pad" style={{ color: 'var(--alloy-pink)' }}>{error}</div>;
  if (!clients) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading…</div>;

  const live = clients.filter((c) => c.started_at && !c.completed_at);
  const done = clients.filter((c) => c.completed_at);
  const fresh = clients.filter((c) => !c.started_at);
  const stuckTotal = live.reduce((n, c) => n + (c.stuck || 0), 0);

  const Row = ({ c }) => {
    const pct = c.total ? Math.round((c.resolved / c.total) * 100) : 0;
    const missing = c.started_at ? missingTemplateItems((c.keys || []).map((key) => ({ key }))).length : 0;
    const isBusy = busy === c.id;
    const allIn = c.total > 0 && c.resolved === c.total;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Mark c={c} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--alloy-purple)' }}>{nameOf(c)}</span>
            {c.started_at ? (
              <>
                {c.stuck ? <Pill tone="pink">{c.stuck} stuck</Pill> : null}
                {allIn && !c.completed_at ? <Pill tone="green">All in — confirm &amp; complete</Pill> : null}
                {c.confirmed ? <Pill tone="purple">{c.confirmed} confirmed</Pill> : null}
                {c.contacts ? <Pill>{c.contacts} {c.contacts === 1 ? 'contact' : 'contacts'}</Pill> : null}
                {c.locations ? <Pill>{c.locations} {c.locations === 1 ? 'location' : 'locations'}</Pill> : null}
              </>
            ) : <Pill>Not started</Pill>}
          </div>
          {c.started_at ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 3 }}>
                {c.resolved} / {c.total} handled · last update {relTime(c.last)}{c.lastBy ? ` by ${c.lastBy}` : ''}
                {c.completed_at ? ` · completed ${relTime(c.completed_at)}` : ` · started ${relTime(c.started_at)}`}
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--alloy-off-white)', overflow: 'hidden', marginTop: 6, maxWidth: 360 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: c.completed_at ? '#2c6e62' : 'var(--alloy-purple)' }} />
              </div>
            </>
          ) : <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 3 }}>No checklist yet — nothing shows in their portal.</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!c.started_at ? (
            <button className="btn btn-primary btn-sm" onClick={() => start(c)} disabled={isBusy}>{isBusy ? '…' : 'Start checklist'}</button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => go(`/c/${c.id}/onboarding`)}>Open</button>
              {missing ? <button className="btn btn-secondary btn-sm" onClick={() => addMissing(c, missing)} disabled={isBusy} title="The template grew since this checklist was started">+ {missing} new</button> : null}
              {c.completed_at
                ? <button className="btn btn-ghost btn-sm" onClick={() => complete(c, false)} disabled={isBusy}>Reopen</button>
                : <button className="btn btn-ghost btn-sm" onClick={() => complete(c, true)} disabled={isBusy}>Mark complete</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => reset(c)} disabled={isBusy} style={{ color: 'var(--alloy-pink)' }}>Reset</button>
              {c.completed_at ? <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} disabled={isBusy} style={{ color: 'var(--alloy-pink)' }}>Remove</button> : null}
            </>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ label, rows, empty }) => (
    <div className="card" style={{ padding: 0, marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>{label} · {rows.length}</div>
      {rows.length ? rows.map((c) => <Row key={c.id} c={c} />) : <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--fg-muted)' }}>{empty}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {[
          { label: 'In progress', value: live.length },
          { label: 'Stuck items', value: stuckTotal, tone: stuckTotal ? 'var(--alloy-pink)' : undefined },
          { label: 'Completed', value: done.length },
          { label: 'Template items', value: TEMPLATE.length },
        ].map((s) => (
          <div key={s.label} className="card card-pad" style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: s.tone || 'var(--alloy-purple)', marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--alloy-purple)', marginTop: 2 }}><I.Info width={16} height={16} /></span>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
          <strong>New clients get the checklist automatically</strong> when you create them (there’s a checkbox on the New client form). Existing clients: hit <em>Start checklist</em>. The client sees an <em>Onboarding</em> page with a to-do badge plus a card on their dashboard until you mark it complete. Open a client’s checklist to confirm access in the <em>Alloy</em> column — that’s the old sheet’s “Alloy Confirm”. The line items themselves live in <code>src/lib/onboarding.js</code>; when that list grows, a <em>+ N new</em> button appears here per client.
        </div>
      </div>

      {notice ? <div style={{ marginBottom: 12, background: 'var(--alloy-green-tint)', color: '#2c6e62', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{notice}</div> : null}
      {error ? <div style={{ marginBottom: 12, background: 'var(--alloy-pink-tint)', color: 'var(--alloy-pink)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{error}</div> : null}

      <Section label="In progress" rows={live} empty="No client is onboarding right now." />
      <Section label="Not started" rows={fresh} empty="Every client has a checklist." />
      <Section label="Completed" rows={done} empty="None completed yet." />
    </div>
  );
}
