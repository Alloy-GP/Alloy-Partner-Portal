import React from 'react';
import { supabase } from '../lib/supabase.js';
import {
  getEngagementProposal, saveEngagementProposal, sendEngagementProposal, withdrawEngagementProposal, unsendEngagementProposal,
  blankProposalForm, viewToForm, validateProposalForm, validateForSend, sendWarnings,
} from '../lib/adminEngagement.js';
import { notifyProposalSent, replyOnProposal } from '../lib/engagement.js';
import { ENGINE_META, MODULES } from '../lib/engagementCatalog.js';
import { statusLabel, validateChangeRequest, fmtDate } from '../lib/engagementGate.js';
import { PLAN_TEMPLATES, COMPARE_ROW_DEFS, normalizePlans, pickPlan, fmtUSD, dueAtStart, roiFor, defaultValidThrough, isExpired, slugKey } from '../lib/proposalPlans.js';
import { ThreadMessage } from './ThreadMessage.jsx';

const { useState, useEffect } = React;

// Admin → client → Engagement proposal. Authors the redesigned client proposal:
// the cover copy, the client's legal identity (feeds the service agreement),
// 1–3 investment plans with the comparison grid, ROI defaults, proof (video +
// documents), the welcome-call link, validity, and which modules power the
// outcome cards. Send → the client's portal locks to the proposal until their
// owner reads the agreement and accepts. Withdraw → unlocks.

const LBL = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 };
const ERR = { fontSize: 12, color: '#b03a3a', fontWeight: 600, marginTop: 4 };
const HINT = { display: 'block', fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 };
const BOX = { border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, display: 'grid', gap: 12 };
const SUB = { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--alloy-purple)' };
const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const full = { width: '100%', boxSizing: 'border-box' };

const PILL = {
  draft: { bg: 'var(--alloy-yellow-tint, #fdf6e0)', fg: '#7a5a12' },
  sent: { bg: 'var(--alloy-pink-tint, #fce6ee)', fg: 'var(--alloy-pink)' },
  accepted: { bg: 'var(--alloy-green-tint, #e6f3f0)', fg: '#2c6e62' },
  withdrawn: { bg: 'var(--alloy-light-gray)', fg: 'var(--fg-muted)' },
};

function Field({ label, hint, error, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={LBL}>{label}</span>
      {children}
      {error ? <div style={ERR}>{error}</div> : hint ? <span style={HINT}>{hint}</span> : null}
    </label>
  );
}

export default function AdminEngagement({ accountId, company, shortName, locations }) {
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
  const toggleRow = (key) => setForm((f) => ({ ...f, compareRows: { ...f.compareRows, [key]: !f.compareRows[key] } }));

  // ── plans editor ──────────────────────────────────────────────────────────
  const setPlan = (i, k, val) => setForm((f) => {
    const plans = f.plans.map((p, j) => (j === i ? { ...p, [k]: val } : p));
    return { ...f, plans };
  });
  const setRecommended = (i) => setForm((f) => ({ ...f, plans: f.plans.map((p, j) => ({ ...p, recommended: j === i })) }));
  const addPlan = () => setForm((f) => {
    if (f.plans.length >= 3) return f;
    const tpl = PLAN_TEMPLATES[f.plans.length] || PLAN_TEMPLATES[PLAN_TEMPLATES.length - 1];
    const used = new Set(f.plans.map((p) => p.key));
    let key = tpl.key; while (used.has(key)) key += '-2';
    return { ...f, plans: [...f.plans, { ...tpl, key, recommended: f.plans.length === 0 }] };
  });
  const removePlan = (i) => setForm((f) => {
    const plans = f.plans.filter((_, j) => j !== i);
    if (plans.length && !plans.some((p) => p.recommended)) plans[0] = { ...plans[0], recommended: true };
    return { ...f, plans };
  });
  const resetPlans = () => { if (window.confirm('Replace the plans with the three standard tiers?')) setForm((f) => ({ ...f, plans: PLAN_TEMPLATES.map((p) => ({ ...p })) })); };

  const validateOrExplain = (forSend) => {
    const r = forSend ? validateForSend(form) : validateProposalForm(form);
    setErrors(r.errors);
    if (!r.ok) setErr(forSend ? 'A few things the agreement needs before this can go out — see the highlighted fields.' : 'Check the highlighted fields.');
    return r.ok;
  };

  const save = async () => {
    if (!validateOrExplain(false)) return null;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: v ? v.id : null, accountId, userId: uid, form, shortName: shortName || company, currentRef: v ? v.ref : '' });
      setState({ loading: false, view: saved, error: '' });
      setForm(viewToForm(saved));
      setCreating(false);
      setNote(saved.status === 'sent' ? 'Saved. The client sees the update immediately (same version until you re-send).' : `Draft ${saved.ref} saved. Not visible to the client until you send it.`);
      return saved;
    } catch (e) { setErr(String((e && e.message) || e)); return null; }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!validateOrExplain(true)) return;
    const warnings = sendWarnings(form);
    const resend = status === 'sent';
    const ok = window.confirm(
      `${resend ? 'Re-send' : 'Send'} this proposal to ${company}?\n\n` +
      `${resend ? 'The version bumps to v' + ((v.version || 1) + 1) + '. ' : ''}Their portal will be LOCKED to the proposal page until their owner reads the agreement and accepts.` +
      `\nValid through ${form.validThrough || defaultValidThrough()}.` +
      (warnings.length ? `\n\nHeads up:\n• ${warnings.join('\n• ')}` : '') +
      (notifyOwners ? '\n\nThe account owner(s) will be emailed that it is ready.' : ''),
    );
    if (!ok) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: v ? v.id : null, accountId, userId: uid, form, shortName: shortName || company, currentRef: v ? v.ref : '' });
      const sent = await sendEngagementProposal({ id: saved.id, userId: uid, currentStatus: saved.status, currentVersion: saved.version, validThrough: form.validThrough || null });
      let extra = '';
      if (notifyOwners) {
        try {
          const r = await notifyProposalSent(sent.id);
          extra = r.sent ? ` Emailed ${r.sent} owner${r.sent === 1 ? '' : 's'}.` : ` ${r.note || 'No owner email was sent.'}`;
        } catch (e) { extra = ` (Owner email failed: ${String((e && e.message) || e)})`; }
      }
      setState({ loading: false, view: sent, error: '' });
      setForm(viewToForm(sent));
      setNote(`Sent as v${sent.version}, valid through ${fmtDate(sent.validThrough)}. ${company}'s portal is now locked to the proposal.${extra}`);
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
  const cls = (k) => `input${errors[k] ? ' is-invalid' : ''}`;
  const showForm = !!v || creating;
  const plansNorm = normalizePlans(form.plans);
  const rec = pickPlan(plansNorm);
  const roi = rec ? roiFor({ monthly: rec.monthly, feePerDoor: Number(form.roiFeePerDoor), doors: Number(form.roiDoorsPerCommunity) }) : null;
  const expired = v && isExpired(v.validThrough);

  return (
    <div data-testid="admin-engagement">
      <div className="section-title" style={{ marginTop: 24 }}><span className="pip" />Engagement proposal</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 14 }}>
        {state.loading ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div> : state.error ? (
          <div style={ERR}>{state.error}{/relation|does not exist|schema cache|column/i.test(state.error) ? ' — an engagement_proposals migration has not been applied to this database yet.' : ''}</div>
        ) : (
          <>
            {/* status strip */}
            {v ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', fontSize: 13 }} data-testid="admin-engagement-status">
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: (PILL[status] || PILL.draft).bg, color: (PILL[status] || PILL.draft).fg }}>{statusLabel(status)}</span>
                {v.ref ? <span className="mono" style={{ color: 'var(--fg-2)', fontWeight: 700 }}>{v.ref}</span> : null}
                <span className="mono" style={{ color: 'var(--fg-muted)' }}>v{v.version}</span>
                {v.sentAt ? <span style={{ color: 'var(--fg-muted)' }}>sent {fmtWhen(v.sentAt)}</span> : null}
                {status === 'sent' && v.validThrough ? <span style={{ color: expired ? '#b03a3a' : 'var(--fg-muted)', fontWeight: expired ? 700 : 400 }}>{expired ? 'EXPIRED ' : 'valid through '}{fmtDate(v.validThrough)}</span> : null}
                {status === 'accepted' ? (
                  <span style={{ color: '#2c6e62', fontWeight: 600 }}>
                    accepted by {v.acceptedName || '—'}{v.acceptedTitle ? ` (${v.acceptedTitle})` : ''} · {fmtWhen(v.acceptedAt)} · v{v.acceptedVersion}
                    {v.acceptedPlanKey ? ` · ${(pickPlan(v.plans, v.acceptedPlanKey) || {}).name || v.acceptedPlanKey} plan` : ''}
                    {v.hasAgreementSnapshot ? ' · agreement snapshot on file' : ''}
                  </span>
                ) : null}
                <div style={{ flex: 1 }} />
                <a className="btn btn-secondary btn-sm" href={previewHref} target="_blank" rel="noopener noreferrer">Preview as client ↗</a>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--fg-2)' }}>No proposal yet.</strong> Create one; the client sees nothing until you send it.</span>
                {!creating ? <button className="btn btn-primary btn-sm" onClick={() => { setForm(blankProposalForm({ company, locations })); setCreating(true); }} data-testid="admin-engagement-create">Create proposal</button> : null}
              </div>
            )}

            {/* conversation */}
            {v && (v.thread.length || status === 'sent' || status === 'accepted') ? (
              <div style={{ ...BOX, background: '#fbfafd', gap: 8, padding: '10px 12px' }} data-testid="admin-engagement-thread">
                <div style={{ ...LBL, marginBottom: 0 }}>Conversation with the client · {v.thread.length}</div>
                {v.thread.length ? (
                  <div className="eg-thread">{v.thread.map((m, i) => <ThreadMessage key={i} m={m} mine={m.role === 'staff'} />)}</div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Nothing yet. Questions the client asks on the proposal page land here; anything you write below is emailed to them with a link back to it.</div>
                )}
                <textarea className="input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the client…" style={{ ...full, resize: 'vertical' }} data-testid="admin-engagement-reply" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={sendReply} disabled={replyBusy || busy || !reply.trim()}>{replyBusy ? 'Sending…' : 'Reply'}</button>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Posted to the proposal page and emailed to whoever asked (or the owners), from your address.</span>
                </div>
              </div>
            ) : null}

            {showForm ? (
              <div style={{ display: 'grid', gap: 16 }} data-testid="admin-engagement-form">
                {/* ── Cover ── */}
                <div style={BOX}>
                  <div style={SUB}>Cover</div>
                  <Field label="Title" error={errors.title}><input className={cls('title')} value={form.title} onChange={set('title')} style={full} /></Field>
                  <Field label="Intro (client-facing)" hint="One or two short paragraphs on the purple cover. Blank line = new paragraph.">
                    <textarea className="input" rows={3} value={form.intro} onChange={set('intro')} style={{ ...full, resize: 'vertical' }} />
                  </Field>
                  <Field label="Closing (client-facing, above Next steps)">
                    <textarea className="input" rows={2} value={form.closing} onChange={set('closing')} style={{ ...full, resize: 'vertical' }} />
                  </Field>
                </div>

                {/* ── Client legal identity ── */}
                <div style={BOX}>
                  <div style={SUB}>Client legal identity <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-muted)' }}>· fills the service agreement</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                    <Field label="Legal name" error={errors.clientLegalName} hint="Exactly as it should appear on the contract."><input className={cls('clientLegalName')} value={form.clientLegalName} onChange={set('clientLegalName')} placeholder="Community Management, LLC" style={full} /></Field>
                    <Field label="Entity type" error={errors.clientEntityType}><input className={cls('clientEntityType')} value={form.clientEntityType} onChange={set('clientEntityType')} placeholder="Louisiana limited liability company" style={full} /></Field>
                  </div>
                  <Field label="Principal place of business" error={errors.clientAddress}><input className={cls('clientAddress')} value={form.clientAddress} onChange={set('clientAddress')} placeholder="140 Aspen Square, Suite H, Denham Springs, LA 70726" style={full} /></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <Field label="Start / effective date" error={errors.startDate}><input className={cls('startDate')} type="date" value={form.startDate} onChange={set('startDate')} style={full} /></Field>
                    <Field label="Valid through" error={errors.validThrough} hint={form.validThrough ? '' : `Blank = 30 days from send (${defaultValidThrough()}).`}><input className={cls('validThrough')} type="date" value={form.validThrough} onChange={set('validThrough')} style={full} /></Field>
                    <Field label="Welcome-call scheduling link" error={errors.welcomeCallUrl} hint="Shown after they accept."><input className={cls('welcomeCallUrl')} value={form.welcomeCallUrl} onChange={set('welcomeCallUrl')} placeholder="https://…" style={full} /></Field>
                  </div>
                </div>

                {/* ── Plans ── */}
                <div style={BOX}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={SUB}>Investment plans <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-muted)' }}>· 1 to 3, one recommended</span></div>
                    <div style={{ flex: 1 }} />
                    {form.plans.length < 3 ? <button type="button" className="btn btn-secondary btn-sm" onClick={addPlan} data-testid="admin-plan-add">+ Add plan</button> : null}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetPlans}>Standard tiers</button>
                  </div>
                  {errors.plans ? <div style={ERR}>{errors.plans}</div> : null}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, form.plans.length)}, minmax(0, 1fr))`, gap: 12 }}>
                    {form.plans.map((p, i) => (
                      <div key={i} style={{ border: `2px solid ${p.recommended ? 'var(--alloy-purple)' : 'var(--border-subtle)'}`, borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: p.recommended ? 'var(--alloy-purple-tint)' : '#fff' }} data-testid={`admin-plan-${i}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input className="input" value={p.name} onChange={(e) => setPlan(i, 'name', e.target.value)} placeholder="Plan name" style={{ ...full, fontWeight: 700 }} data-testid={`admin-plan-${i}-name`} />
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePlan(i)} aria-label="Remove plan" title="Remove plan">✕</button>
                        </div>
                        <input className="input" value={p.tagline} onChange={(e) => setPlan(i, 'tagline', e.target.value)} placeholder="Tagline, e.g. Three markets" style={full} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Field label="Monthly ($)"><input className="input" inputMode="decimal" value={p.monthly} onChange={(e) => setPlan(i, 'monthly', e.target.value)} style={full} /></Field>
                          <Field label="Setup ($)"><input className="input" inputMode="decimal" value={p.setup} onChange={(e) => setPlan(i, 'setup', e.target.value)} style={full} /></Field>
                          <Field label="Locations"><input className="input" type="number" min="1" step="1" value={p.locations} onChange={(e) => setPlan(i, 'locations', e.target.value)} style={full} /></Field>
                          <Field label="Term (months)"><input className="input" type="number" min="1" step="1" value={p.termMonths} onChange={(e) => setPlan(i, 'termMonths', e.target.value)} style={full} /></Field>
                        </div>
                        <Field label="Referral discount ($ / mo per referred firm)"><input className="input" inputMode="decimal" value={p.referralDiscount} onChange={(e) => setPlan(i, 'referralDiscount', e.target.value)} style={full} /></Field>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={!!p.guarantee} onChange={(e) => setPlan(i, 'guarantee', e.target.checked)} /> Results Guarantee (adds Sec. 8.8–8.9)</label>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={!!p.exclusive} onChange={(e) => setPlan(i, 'exclusive', e.target.checked)} /> Market exclusivity (Sec. 3.2)</label>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--alloy-purple)' }}><input type="radio" name={`rec-${accountId}`} checked={!!p.recommended} onChange={() => setRecommended(i)} /> Recommended</label>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Due at start {fmtUSD(dueAtStart({ monthly: Number(String(p.monthly).replace(/[$,]/g, '')) || 0, setup: Number(String(p.setup).replace(/[$,]/g, '')) || 0 }))}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' }}>
                    <div>
                      <span style={LBL}>Comparison rows shown</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                        {COMPARE_ROW_DEFS.map((r) => (
                          <label key={r.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
                            <input type="checkbox" checked={form.compareRows[r.key] !== false} onChange={() => toggleRow(r.key)} /> {r.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <Field label="Exclusivity radius (miles)" error={errors.exclusivityMiles}><input className={cls('exclusivityMiles')} type="number" min="1" step="1" value={form.exclusivityMiles} onChange={set('exclusivityMiles')} style={full} /></Field>
                  </div>
                </div>

                {/* ── ROI + proof ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={BOX}>
                    <div style={SUB}>“How it pays for itself”</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label="Fee per door / mo ($)" error={errors.roiFeePerDoor}><input className={cls('roiFeePerDoor')} inputMode="decimal" value={form.roiFeePerDoor} onChange={set('roiFeePerDoor')} style={full} /></Field>
                      <Field label="Doors per community" error={errors.roiDoorsPerCommunity}><input className={cls('roiDoorsPerCommunity')} type="number" min="1" step="1" value={form.roiDoorsPerCommunity} onChange={set('roiDoorsPerCommunity')} style={full} /></Field>
                    </div>
                    {roi && rec ? <div style={{ fontSize: 12.5, color: 'var(--fg-2)' }} data-testid="admin-roi-preview">At {rec.name}: <strong>{roi.communities}</strong> {roi.label} covers {fmtUSD(roi.feeYear)}/yr (one community ≈ {fmtUSD(roi.perCommunity)}/yr). The client can change both inputs.</div> : null}
                  </div>
                  <div style={BOX}>
                    <div style={SUB}>Proof &amp; reference</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                      <Field label="Testimonial Vimeo id" error={errors.testimonialVimeoId}><input className={cls('testimonialVimeoId')} value={form.testimonialVimeoId} onChange={set('testimonialVimeoId')} placeholder="1131397045" style={full} /></Field>
                      <Field label="Caption"><input className="input" value={form.testimonialCaption} onChange={set('testimonialCaption')} placeholder="Client testimonial · 2:58" style={full} /></Field>
                    </div>
                    <Field label="Reference documents" error={errors.linksText} hint={<>One per line: <span className="mono">Label | URL</span>. A bare URL gets a label from its filename.</>}>
                      <textarea className={cls('linksText')} rows={3} value={form.linksText} onChange={set('linksText')} placeholder={'Q3 2026 Growth Playbook | https://view.alloygp.co/<client>/playbook/….html'} style={{ ...full, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.6, resize: 'vertical' }} />
                    </Field>
                  </div>
                </div>

                {/* ── Modules → outcome cards ── */}
                <div style={BOX}>
                  <div style={SUB}>What you get <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-muted)' }}>· switched-on modules become the chips on the four outcome cards</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                    {ENGINE_META.map((e) => (
                      <div key={e.key} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--alloy-off-white)', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-3)' }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, background: e.color, display: 'inline-block' }} />{e.name}
                        </div>
                        {MODULES.filter((m) => m.engine === e.key).map((m) => {
                          const on = form.modules.includes(m.key);
                          return (
                            <label key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 12px', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13, color: on ? 'var(--alloy-purple)' : 'var(--fg-muted)', fontWeight: on ? 700 : 500 }} data-testid={`admin-module-${m.key}`}>
                              <input type="checkbox" checked={on} onChange={() => toggleModule(m.key)} /> {m.name}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

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
