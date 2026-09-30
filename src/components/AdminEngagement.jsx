import React from 'react';
import { supabase } from '../lib/supabase.js';
import {
  getEngagementProposal, saveEngagementProposal, sendEngagementProposal, withdrawEngagementProposal, unsendEngagementProposal,
  blankProposalForm, viewToForm, validateProposalForm, sendWarnings,
} from '../lib/adminEngagement.js';
import { notifyProposalSent, replyOnProposal } from '../lib/engagement.js';
import { ThreadMessage } from './ProposalGate.jsx';
import { ENGINE_META, MODULES, deliverableLines, locationImpact, normalizeLocations, scalesWithLocations } from '../lib/engagementCatalog.js';
import { statusLabel, fmtDate, fmtMoney, validateChangeRequest } from '../lib/engagementGate.js';

const { useState, useEffect } = React;

// Admin → client → Engagement proposal. Author Alloy's proposal to a new client
// from the evergreen catalog: switch modules on, set the location count (the
// document scales every per-market line from it), price, dates, reference docs.
// Send → the client's portal locks to the proposal until their owner accepts.
// Withdraw → unlocks. Staff QA the client view via "Preview as client".

const LBL = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 };
const ERR = { fontSize: 12, color: '#b03a3a', fontWeight: 600, marginTop: 4 };
const HINT = { display: 'block', fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 };
const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const PILL = {
  draft: { bg: 'var(--alloy-yellow-tint, #fdf6e0)', fg: '#7a5a12' },
  sent: { bg: 'var(--alloy-pink-tint, #fce6ee)', fg: 'var(--alloy-pink)' },
  accepted: { bg: 'var(--alloy-green-tint, #e6f3f0)', fg: '#2c6e62' },
  withdrawn: { bg: 'var(--alloy-light-gray)', fg: 'var(--fg-muted)' },
};

export default function AdminEngagement({ accountId, company, locations }) {
  const [state, setState] = useState({ loading: true, view: null, error: '' });
  const [form, setForm] = useState(() => blankProposalForm({ company, locations }));
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [notifyOwners, setNotifyOwners] = useState(true);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [uid, setUid] = useState(null);

  useEffect(() => { supabase.auth.getUser().then((r) => setUid((r && r.data && r.data.user && r.data.user.id) || null)).catch(() => {}); }, []);

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const view = await getEngagementProposal(accountId);
      setState({ loading: false, view, error: '' });
      setForm(view ? viewToForm(view) : blankProposalForm({ company, locations }));
      setCreating(false);
    } catch (e) {
      setState({ loading: false, view: null, error: String((e && e.message) || e) });
    }
  };
  useEffect(() => { setNote(''); setErr(''); setErrors({}); load(); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = state.view;
  const status = v ? v.status : null;
  const set = (k) => (e) => {
    const val = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [k]: val }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };
  const toggleModule = (key) => setForm((f) => ({ ...f, modules: f.modules.includes(key) ? f.modules.filter((k) => k !== key) : [...f.modules, key] }));

  const validateOrExplain = () => {
    const r = validateProposalForm(form);
    setErrors(r.errors);
    if (!r.ok) setErr('Check the highlighted fields.');
    return r.ok;
  };

  const save = async () => {
    if (!validateOrExplain()) return null;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: v ? v.id : null, accountId, userId: uid, form });
      setState({ loading: false, view: saved, error: '' });
      setCreating(false);
      setNote(saved.status === 'sent' ? 'Saved. The client sees the update immediately (same version until you re-send).' : 'Draft saved. Not visible to the client until you send it.');
      return saved;
    } catch (e) { setErr(String((e && e.message) || e)); return null; }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!validateOrExplain()) return;
    const warnings = sendWarnings(form);
    const resend = status === 'sent';
    const ok = window.confirm(
      `${resend ? 'Re-send' : 'Send'} this proposal to ${company}?\n\n` +
      `${resend ? 'The version bumps to v' + ((v.version || 1) + 1) + '. ' : ''}Their portal will be LOCKED to the proposal page until their owner accepts.` +
      (warnings.length ? `\n\nHeads up:\n• ${warnings.join('\n• ')}` : '') +
      (notifyOwners ? '\n\nThe account owner(s) will be emailed that it is ready.' : ''),
    );
    if (!ok) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: v ? v.id : null, accountId, userId: uid, form });
      const sent = await sendEngagementProposal({ id: saved.id, userId: uid, currentStatus: saved.status, currentVersion: saved.version });
      let extra = '';
      if (notifyOwners) {
        try {
          const r = await notifyProposalSent(sent.id);
          extra = r.sent ? ` Emailed ${r.sent} owner${r.sent === 1 ? '' : 's'}.` : ` ${r.note || 'No owner email was sent.'}`;
        } catch (e) { extra = ` (Owner email failed: ${String((e && e.message) || e)})`; }
      }
      setState({ loading: false, view: sent, error: '' });
      setNote(`Sent as v${sent.version}. ${company}'s portal is now locked to the proposal.${extra}`);
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const unsend = async () => {
    if (!window.confirm(`Take the proposal back to Draft?\n\n${company}'s portal unlocks; nothing is deleted and you can send again.`)) return;
    setBusy(true); setErr(''); setNote('');
    try { const r = await unsendEngagementProposal(v.id); setState({ loading: false, view: r, error: '' }); setNote('Back to draft. The portal is open again.'); }
    catch (e) { setErr(String((e && e.message) || e)); } finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!window.confirm(`Withdraw this proposal for ${company}?\n\nIt is kept for the record; the portal unlocks and you can create a new proposal.`)) return;
    setBusy(true); setErr(''); setNote('');
    try { await withdrawEngagementProposal(v.id); await load(); setNote('Withdrawn. Create a new proposal when ready.'); }
    catch (e) { setErr(String((e && e.message) || e)); } finally { setBusy(false); }
  };

  const sendReply = async () => {
    const r = validateChangeRequest(reply);
    if (!r.ok) { setErr(r.error); return; }
    setReplyBusy(true); setErr(''); setNote('');
    try {
      const res = await replyOnProposal({ proposalId: v.id, message: r.message });
      setReply('');
      await load();
      setNote(res && res.to && res.to.length ? `Reply posted and emailed to ${res.to.join(', ')}.` : 'Reply posted.');
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setReplyBusy(false); }
  };

  const previewHref = `/c/${accountId}/?as=client`;
  const n = normalizeLocations(form.locationsCount);
  const impact = locationImpact(form.modules, n);
  const cls = (k) => `input${errors[k] ? ' is-invalid' : ''}`;
  const showForm = !!v || creating;

  return (
    <div data-testid="admin-engagement">
      <div className="section-title" style={{ marginTop: 24 }}><span className="pip" />Engagement proposal</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 14 }}>
        {state.loading ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div> : state.error ? (
          <div style={ERR}>{state.error}{/relation|does not exist|schema cache/i.test(state.error) ? ' — the engagement_proposals migration has not been applied to this database yet.' : ''}</div>
        ) : (
          <>
            {/* status strip */}
            {v ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', fontSize: 13 }} data-testid="admin-engagement-status">
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: (PILL[status] || PILL.draft).bg, color: (PILL[status] || PILL.draft).fg }}>{statusLabel(status)}</span>
                <span className="mono" style={{ color: 'var(--fg-muted)' }}>v{v.version}</span>
                {v.sentAt ? <span style={{ color: 'var(--fg-muted)' }}>sent {fmtWhen(v.sentAt)}</span> : null}
                {status === 'accepted' ? <span style={{ color: '#2c6e62', fontWeight: 600 }}>accepted by {v.acceptedName || '—'}{v.acceptedTitle ? ` (${v.acceptedTitle})` : ''} · {fmtWhen(v.acceptedAt)} · v{v.acceptedVersion} · agreement {v.agreementVersion || 'v1'}</span> : null}
                <div style={{ flex: 1 }} />
                <a className="btn btn-secondary btn-sm" href={previewHref} target="_blank" rel="noopener noreferrer">Preview as client ↗</a>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--fg-2)' }}>No proposal yet.</strong> Create one from the evergreen catalog; the client sees nothing until you send it.</span>
                {!creating ? <button className="btn btn-primary btn-sm" onClick={() => { setForm(blankProposalForm({ company, locations })); setCreating(true); }} data-testid="admin-engagement-create">Create proposal</button> : null}
              </div>
            )}

            {/* the conversation with the client — their questions, your replies */}
            {v && (v.thread.length || status === 'sent' || status === 'accepted') ? (
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 8, background: '#fbfafd' }} data-testid="admin-engagement-thread">
                <div style={{ ...LBL, marginBottom: 0 }}>Conversation with the client · {v.thread.length}</div>
                {v.thread.length ? (
                  <div className="eg-thread">{v.thread.map((m, i) => <ThreadMessage key={i} m={m} mine={m.role === 'staff'} />)}</div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Nothing yet. Questions the client asks on the proposal page land here; anything you write below is emailed to them with a link back to it.</div>
                )}
                <textarea className="input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the client…" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} data-testid="admin-engagement-reply" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={sendReply} disabled={replyBusy || busy || !reply.trim()}>{replyBusy ? 'Sending…' : 'Reply'}</button>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Posted to the proposal page and emailed to whoever asked (or the owners), from your address.</span>
                </div>
              </div>
            ) : null}

            {showForm ? (
              <div style={{ display: 'grid', gap: 14 }} data-testid="admin-engagement-form">
                <label style={{ display: 'block' }}>
                  <span style={LBL}>Title</span>
                  <input className={cls('title')} value={form.title} onChange={set('title')} style={{ width: '100%', boxSizing: 'border-box' }} />
                  {errors.title ? <div style={ERR}>{errors.title}</div> : null}
                </label>
                <label style={{ display: 'block' }}>
                  <span style={LBL}>Intro (client-facing)</span>
                  <textarea className="input" rows={4} value={form.intro} onChange={set('intro')} placeholder={'Why this plan, in your words. Blank line = new paragraph.'} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'start' }}>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Locations they manage</span>
                    <input className={cls('locationsCount')} type="number" min="1" step="1" value={form.locationsCount} onChange={set('locationsCount')} style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.locationsCount ? <div style={ERR}>{errors.locationsCount}</div> : <span style={HINT}>Every per-market line in the document multiplies by this.</span>}
                  </label>
                  <div style={{ background: 'var(--alloy-purple-tint)', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }} data-testid="admin-engagement-impact">
                    <strong>Effort index {impact.atN}</strong> at {n} location{n === 1 ? '' : 's'}{n > 1 ? <> · <strong>{impact.multiplier}×</strong> a single market ({impact.atOne})</> : null}.
                    {impact.scalingModules.length ? <span style={{ color: 'var(--fg-muted)' }}> Scaling: {impact.scalingModules.length} of {form.modules.length} modules.</span> : null}
                  </div>
                </div>

                {/* modules */}
                <div>
                  <span style={LBL}>Modules (evergreen catalog)</span>
                  {errors.modules ? <div style={{ ...ERR, marginBottom: 6 }}>{errors.modules}</div> : null}
                  <div style={{ display: 'grid', gap: 10 }}>
                    {ENGINE_META.map((e) => (
                      <div key={e.key} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--alloy-off-white)', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-3)' }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, background: e.color, display: 'inline-block' }} />{e.name}
                          <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-muted)' }}>· {e.tagline}</span>
                        </div>
                        {MODULES.filter((m) => m.engine === e.key).map((m) => {
                          const on = form.modules.includes(m.key);
                          return (
                            <label key={m.key} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', background: on ? '#fff' : '#fbfafd' }} data-testid={`admin-module-${m.key}`}>
                              <input type="checkbox" checked={on} onChange={() => toggleModule(m.key)} style={{ marginTop: 3 }} />
                              <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                                <strong style={{ color: on ? 'var(--alloy-purple)' : 'var(--fg-muted)' }}>{m.name}</strong>
                                {scalesWithLocations(m) ? <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--alloy-pink)', textTransform: 'uppercase', letterSpacing: '.05em' }}>per location</span> : null}
                                <span style={{ display: 'block', color: 'var(--fg-muted)', fontSize: 12.5 }}>{m.summary}</span>
                                {on ? <span style={{ display: 'block', color: 'var(--fg-2)', fontSize: 12, marginTop: 2 }}>{deliverableLines(m, n).join(' · ')}</span> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Monthly ($)</span>
                    <input className={cls('monthlyAmount')} inputMode="decimal" value={form.monthlyAmount} onChange={set('monthlyAmount')} placeholder="e.g. 4250" style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.monthlyAmount ? <div style={ERR}>{errors.monthlyAmount}</div> : null}
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Setup ($, optional)</span>
                    <input className="input" inputMode="decimal" value={form.setupAmount} onChange={set('setupAmount')} placeholder="one-time" style={{ width: '100%', boxSizing: 'border-box' }} />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Start date</span>
                    <input className="input" type="date" value={form.startDate} onChange={set('startDate')} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={LBL}>Term (months)</span>
                    <input className={cls('termMonths')} type="number" min="1" step="1" value={form.termMonths} onChange={set('termMonths')} placeholder="optional" style={{ width: '100%', boxSizing: 'border-box' }} />
                    {errors.termMonths ? <div style={ERR}>{errors.termMonths}</div> : null}
                  </label>
                </div>

                <label style={{ display: 'block' }}>
                  <span style={LBL}>Reference documents</span>
                  <textarea className={cls('linksText')} rows={3} value={form.linksText} onChange={set('linksText')} placeholder={'Growth audit | https://view.alloygp.co/<client>/audit/....html\nhttps://view.alloygp.co/<client>/playbook/....html'} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.6, resize: 'vertical' }} />
                  {errors.linksText ? <div style={ERR}>{errors.linksText}</div> : <span style={HINT}>One per line: <span className="mono">Label | URL</span>. A bare URL gets a label from its filename. Shown as “Documents behind this proposal”.</span>}
                </label>

                <label style={{ display: 'block' }}>
                  <span style={LBL}>Closing (client-facing)</span>
                  <textarea className="input" rows={3} value={form.closing} onChange={set('closing')} placeholder="Anything to say before the “what happens when you accept” steps." style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                </label>

                {/* actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={save} disabled={busy} data-testid="admin-engagement-save">{busy ? 'Working…' : (v ? 'Save' : 'Save draft')}</button>
                  {status !== 'accepted' ? (
                    <button className="btn btn-primary" onClick={send} disabled={busy} data-testid="admin-engagement-send">{status === 'sent' ? 'Save & re-send (v+1)' : 'Send to client'}</button>
                  ) : null}
                  {status !== 'accepted' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--fg-2)' }}>
                      <input type="checkbox" checked={notifyOwners} onChange={(e) => setNotifyOwners(e.target.checked)} /> Email the owner(s) it’s ready
                    </label>
                  ) : null}
                  <div style={{ flex: 1 }} />
                  {status === 'sent' ? <button className="btn btn-ghost btn-sm" onClick={unsend} disabled={busy}>Back to draft</button> : null}
                  {v && !creating ? <button className="btn btn-ghost btn-sm" style={{ color: 'var(--alloy-pink)' }} onClick={withdraw} disabled={busy} data-testid="admin-engagement-withdraw">Withdraw</button> : null}
                  {creating && !v ? <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)} disabled={busy}>Cancel</button> : null}
                </div>
                {v && v.monthlyAmount ? <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Currently saved: {fmtMoney(v.monthlyAmount)}/mo{v.startDate ? ` · starts ${fmtDate(v.startDate)}` : ''}.</div> : null}
              </div>
            ) : null}

            {note ? <div style={{ fontSize: 13, color: '#2c6e62', fontWeight: 600 }} data-testid="admin-engagement-note">{note}</div> : null}
            {err ? <div style={ERR} data-testid="admin-engagement-err">{err}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
