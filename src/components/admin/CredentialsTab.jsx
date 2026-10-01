import React from 'react';
import { supabase } from '../../lib/supabase.js';
import { SECTIONS, rowToItem, groupBySection, onboardingProgress, statusMeta, fieldsFor, isFreeform, derivePaymentStatus } from '../../lib/onboarding.js';

const { useState, useEffect } = React;

// Admin → Manage Clients → Credentials. Everything the client entered in their
// onboarding checklist, read-only: contacts, locations, the bank step, and every
// credential/link/note per platform with Alloy's confirm beside it. Reads
// onboarding_items directly (staff RLS). Editing — statuses, Alloy confirm,
// adding rows — happens in the client's own checklist ("Open checklist").

const TONE = { muted: 'var(--a-muted, #7a6f88)', blue: '#2a6391', green: '#2c6e62', purple: 'var(--alloy-purple)', pink: 'var(--alloy-pink)' };
const BG = { muted: 'var(--alloy-off-white)', blue: 'var(--alloy-blue-tint)', green: 'var(--alloy-green-tint)', purple: 'var(--alloy-purple-tint)', pink: 'var(--alloy-pink-tint)' };

function StatusPill({ value, prefix }) {
  if (!value) return null;
  const m = statusMeta(value);
  return <span className="pill" style={{ background: BG[m.tone], color: TONE[m.tone] }}>{prefix ? `${prefix} ${m.label}` : m.label}</span>;
}

function Secret({ value }) {
  const [show, setShow] = useState(false);
  if (!value) return <span style={{ color: 'var(--a-muted, #7a6f88)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="mono">{show ? value : '•'.repeat(Math.min(12, Math.max(6, String(value).length)))}</span>
      <button type="button" className="link" onClick={() => setShow((s) => !s)} style={{ fontSize: 11 }}>{show ? 'Hide' : 'Show'}</button>
    </span>
  );
}

function FieldList({ item }) {
  const specs = fieldsFor(item.kind);
  const filled = specs.filter((f) => String((item.fields || {})[f.k] || '').trim());
  if (!filled.length) return <div className="help" style={{ margin: '4px 0 0' }}>Nothing entered yet.</div>;
  return (
    <dl className="adm-cred-fields">
      {filled.map((f) => {
        const v = String(item.fields[f.k]);
        return (
          <React.Fragment key={f.k}>
            <dt>{f.label}</dt>
            <dd>
              {f.type === 'password' ? <Secret value={v} />
                : f.type === 'url' || /^https?:\/\//i.test(v) ? <a href={/^https?:\/\//i.test(v) ? v : `https://${v}`} target="_blank" rel="noopener noreferrer" className="link">{v}</a>
                : f.type === 'textarea' ? <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>
                : <span className={f.k === 'username' || f.k === 'account_number' ? 'mono' : ''}>{v}</span>}
            </dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

export default function CredentialsTab({ accountId, account, bankOnFile, autopayRequired }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setItems(null); setError('');
    if (!accountId || !supabase) { setItems([]); return undefined; }
    supabase.from('onboarding_items').select('*').eq('account_id', accountId).order('sort')
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) { setError(String(e.message || e)); setItems([]); return; }
        setItems((data || []).map((r) => derivePaymentStatus(rowToItem(r), { bankOnFile: !!bankOnFile, autopayRequired: autopayRequired !== false })));
      });
    return () => { alive = false; };
  }, [accountId, bankOnFile, autopayRequired]);

  const started = !!(account && account.onboarding_started_at);
  const completed = !!(account && account.onboarding_completed_at);
  if (error) return <div className="card"><div className="err">{error}</div></div>;
  if (items === null) return <div className="adm-empty">Loading…</div>;
  if (!started && !items.length) {
    return (
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Credentials</div>
        <div className="card-sub">No onboarding checklist yet, so nothing has been collected. Start one and the client's contacts, locations, logins and files land here as they fill it in.</div>
        <a className="btn-g" href="/admin/onboarding" style={{ textDecoration: 'none', display: 'inline-block' }} data-testid="adm-cred-start">Go to Admin → Onboarding</a>
      </div>
    );
  }

  const groups = groupBySection(items);
  const prog = onboardingProgress(items);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

  return (
    <>
      <div className="card" data-testid="adm-cred-summary">
        <div className="card-head">
          <div className="eyebrow">Onboarding checklist</div>
          <a className="btn-g" href={`/c/${accountId}/onboarding`} style={{ textDecoration: 'none', display: 'inline-block' }} data-testid="adm-cred-open">Open checklist</a>
        </div>
        <div className="card-sub" style={{ margin: 0 }}>
          {prog.resolved} / {prog.total} items handled{prog.stuck ? ` · ${prog.stuck} stuck` : ''}{prog.confirmed ? ` · ${prog.confirmed} confirmed by Alloy` : ''}
          {completed ? ` · completed ${fmt(account.onboarding_completed_at)}` : started ? ` · started ${fmt(account.onboarding_started_at)}` : ''}
        </div>
        <div className="help">Read-only. Set statuses, confirm access or add rows from the checklist itself.</div>
      </div>

      {SECTIONS.map((sec) => {
        const list = groups[sec.id] || [];
        if (!list.length) return null;
        return (
          <div className="card" key={sec.id} data-testid={`adm-cred-${sec.id}`}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{sec.title}{isFreeform(sec.id) ? ` · ${list.length}` : ''}</div>
            {sec.id === 'contacts' ? (
              <table className="adm-cred-table"><thead><tr><th>Name</th><th>Title / role</th><th>Email</th><th>Phone</th></tr></thead><tbody>
                {list.map((it) => <tr key={it.id}><td><b>{it.label || '—'}</b></td><td>{it.fields.title || '—'}</td><td>{it.fields.email ? <a className="link" href={`mailto:${it.fields.email}`}>{it.fields.email}</a> : '—'}</td><td>{it.fields.phone || '—'}</td></tr>)}
              </tbody></table>
            ) : sec.id === 'locations' ? (
              <>
                <table className="adm-cred-table"><thead><tr><th>Location</th><th>Address</th><th>Phone</th><th>Manager</th><th>Hours</th></tr></thead><tbody>
                  {list.map((it) => (
                    <tr key={it.id}>
                      <td><b>{it.label || '—'}</b>{it.fields.notes ? <div className="help" style={{ margin: '2px 0 0' }}>{it.fields.notes}</div> : null}</td>
                      <td>{it.fields.address || '—'}</td><td>{it.fields.phone || '—'}</td><td>{it.fields.manager || '—'}</td><td>{it.fields.hours || '—'}</td>
                    </tr>
                  ))}
                </tbody></table>
                <div className="help">These sync into the Locations tab automatically.</div>
              </>
            ) : (
              <div className="adm-cred-list">
                {list.map((it) => (
                  <div className="adm-cred-item" key={it.id}>
                    <div className="adm-cred-head">
                      <div className="adm-cred-label">{it.label || <span style={{ color: 'var(--a-muted, #7a6f88)' }}>Untitled</span>}</div>
                      <StatusPill value={it.status} />
                      {it.alloyStatus ? <StatusPill value={it.alloyStatus} prefix="Alloy:" /> : null}
                    </div>
                    {it.kind === 'payment'
                      ? <div className="help" style={{ margin: '4px 0 0' }}>{it.status === 'complete' ? 'Bank account on file (see Billing on the Profile tab).' : it.status === 'na' ? 'Autopay not required for this account.' : 'No bank account yet.'}</div>
                      : <FieldList item={it} />}
                    {it.updatedBy ? <div className="help" style={{ margin: '6px 0 0' }}>Last updated by {it.updatedBy}{it.updatedAt ? ` · ${fmt(it.updatedAt)}` : ''}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
