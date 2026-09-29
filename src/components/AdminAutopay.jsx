import React from 'react';
import { getAccountBilling, listBillingItems, startAutopay, stopAutopay, firstOfNextMonth, validateAutopayForm, fmtMoney, ordinal } from '../lib/adminBilling.js';

const { useState, useEffect } = React;

// Admin → client → Autopay. The last mile after a client adds their bank: pick
// the QuickBooks service item, the monthly amount and the draft day, and start
// the Automated ACH recurring sales receipt — or stop an existing one. Staff
// only (the edge function enforces it); a client never sets their own price.
//
// QuickBooks creates templates ACTIVE, so the first draft is never allowed
// before the 1st of next month: that is the window to check it in QuickBooks.

const fmtDate = (iso) => iso
  ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';
const prettyType = (t) => {
  const s = String(t || '').toUpperCase();
  const kind = s.includes('SAVINGS') ? 'savings' : 'checking';
  return `${s.startsWith('PERSONAL') ? 'Personal' : 'Business'} ${kind}`;
};
const LBL = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 };
const ERR = { fontSize: 12, color: '#b03a3a', fontWeight: 600, marginTop: 4 };

export default function AdminAutopay({ accountId, company }) {
  const [state, setState] = useState({ loading: true, method: null, schedule: null, error: '' });
  const [items, setItems] = useState(null);           // null = not loaded yet
  const [form, setForm] = useState({ itemId: '', amount: '', dayOfMonth: 1, startDate: firstOfNextMonth(), description: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const r = await getAccountBilling(accountId);
      setState({ loading: false, method: r.method, schedule: r.schedule, error: '' });
    } catch (e) {
      setState({ loading: false, method: null, schedule: null, error: String((e && e.message) || e) });
    }
  };
  useEffect(() => {
    setNote(''); setErr(''); setErrors({});
    setForm({ itemId: '', amount: '', dayOfMonth: 1, startDate: firstOfNextMonth(), description: '' });
    load();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = !!(state.schedule && state.schedule.status === 'active');
  const needForm = !state.loading && !!state.method && !active;
  useEffect(() => {
    if (!needForm || items !== null) return;
    listBillingItems().then(setItems).catch((e) => { setItems([]); setErr(String((e && e.message) || e)); });
  }, [needForm, items]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Picking an item prefills its list price if no amount has been typed yet.
      if (k === 'itemId' && !String(f.amount).trim()) {
        const it = (items || []).find((i) => i.id === v);
        if (it && it.unitPrice) next.amount = String(it.unitPrice);
      }
      return next;
    });
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };

  const start = async () => {
    const v = validateAutopayForm(form);
    setErrors(v.errors);
    if (!v.ok) { setErr('Check the highlighted fields.'); return; }
    const item = (items || []).find((i) => i.id === form.itemId);
    const ok = window.confirm(
      `Start autopay for ${company}?\n\n${fmtMoney(form.amount)} every month on the ${ordinal(form.dayOfMonth)}\n` +
      `Item: ${item ? item.name : form.itemId}\nFirst draft: ${fmtDate(form.startDate || firstOfNextMonth())}\n\n` +
      'QuickBooks creates the template ACTIVE — verify it there before the first draft date.',
    );
    if (!ok) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await startAutopay({ accountId, ...form });
      setNote(r.note || `Autopay started — first draft ${fmtDate(r.firstChargeDate)}.`);
      await load();
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const stop = async () => {
    const id = state.schedule && state.schedule.qbo_recurring_txn_id;
    if (!id) { setErr('This schedule has no QuickBooks template id — remove it in QuickBooks.'); return; }
    if (!window.confirm(`Stop autopay for ${company}?\n\nThe QuickBooks recurring template will be deleted and no further drafts will run. The bank stays on file.`)) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await stopAutopay(id);
      if (!r.ok) throw new Error(`QuickBooks refused (${r.status}): ${r.body || ''}`);
      setNote('Autopay stopped — the recurring template was deleted.');
      await load();
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const m = state.method, s = state.schedule;
  const cls = (k) => `input${errors[k] ? ' is-invalid' : ''}`;

  return (
    <div data-testid="admin-autopay">
      <div className="section-title" style={{ marginTop: 24 }}><span className="pip" />Autopay</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 12 }}>
        {state.loading ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div> : state.error ? <div style={ERR}>{state.error}</div> : (
          <>
            {/* 1 · bank on file */}
            {m ? (
              <div data-testid="admin-autopay-bank" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'baseline', fontSize: 13 }}>
                <span style={LBL}>Bank on file</span>
                <strong>{m.bank_name || 'Bank account'}</strong>
                <span>{prettyType(m.account_type)} <span className="mono">•••• {m.last4 || '----'}</span></span>
                <span style={{ color: 'var(--fg-muted)' }}>{m.verification_status === 'VERIFIED' ? 'verified' : 'not verified (normal — QuickBooks drafts anyway)'}</span>
                <span style={{ color: 'var(--fg-muted)' }}>
                  {m.ach_authorized_at ? `ACH authorized ${fmtDate(m.ach_authorized_at)} · agreement ${m.ach_agreement_version || 'v1'}` : 'authorization not recorded (added before the portal flow)'}
                </span>
              </div>
            ) : (
              <div data-testid="admin-autopay-nobank" style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--fg-2)' }}>No bank account on file yet.</strong> The client's owner or accounting user adds it from their portal — they are nudged at sign-in until they do. It shows up here the moment it lands, and autopay can be started then.
              </div>
            )}

            {/* 2 · schedule, or the form to create one */}
            {active ? (
              <div data-testid="admin-autopay-active" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '10px 12px', background: 'var(--alloy-green-tint, #e7f2ef)', borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: 'var(--dark-green, #2c6e62)', letterSpacing: '.04em', fontSize: 12 }}>AUTOPAY ACTIVE</span>
                <span><strong>{fmtMoney(s.amount)}</strong> monthly on the <strong>{ordinal(s.billing_day)}</strong></span>
                <span style={{ color: 'var(--fg-muted)' }}>first draft {fmtDate(s.start_date)} · QuickBooks template #{s.qbo_recurring_txn_id || '?'}</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--alloy-pink)' }} onClick={stop} disabled={busy} data-testid="admin-autopay-stop">{busy ? 'Working…' : 'Stop autopay'}</button>
              </div>
            ) : m ? (
              <div data-testid="admin-autopay-form" style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>QuickBooks service item</span>
                    <select className={cls('itemId')} value={form.itemId} onChange={set('itemId')} disabled={items === null} style={{ width: '100%', boxSizing: 'border-box' }}>
                      <option value="">{items === null ? 'Loading items…' : 'Pick the item to bill against'}</option>
                      {(items || []).map((i) => <option key={i.id} value={i.id}>{i.name}{i.unitPrice ? ` — ${fmtMoney(i.unitPrice)}` : ''}</option>)}
                    </select>
                    {errors.itemId ? <div style={ERR}>{errors.itemId}</div> : null}
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Monthly amount ($)</span>
                    <input className={cls('amount')} type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} placeholder="e.g. 4250" style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.amount ? <div style={ERR}>{errors.amount}</div> : null}
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Draft day (1–28)</span>
                    <input className={cls('dayOfMonth')} type="number" min="1" max="28" value={form.dayOfMonth} onChange={set('dayOfMonth')} style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.dayOfMonth ? <div style={ERR}>{errors.dayOfMonth}</div> : null}
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>First draft</span>
                    <input className={cls('startDate')} type="date" min={firstOfNextMonth()} value={form.startDate} onChange={set('startDate')} style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.startDate ? <div style={ERR}>{errors.startDate}</div> : null}
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Line description (optional)</span>
                    <input className="input" value={form.description} onChange={set('description')} placeholder="Shows on the client's receipt" style={{ width: '100%', boxSizing: 'border-box' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-primary" onClick={start} disabled={busy || items === null} data-testid="admin-autopay-start">{busy ? 'Starting…' : 'Start autopay'}</button>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Creates the Automated ACH recurring sales receipt in QuickBooks. The first draft can't be before the 1st of next month — check the template there before then.</span>
                </div>
              </div>
            ) : null}

            {note ? <div style={{ fontSize: 13, color: 'var(--dark-green, #2c6e62)', fontWeight: 600 }} data-testid="admin-autopay-note">{note}</div> : null}
            {err ? <div style={ERR} data-testid="admin-autopay-err">{err}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
