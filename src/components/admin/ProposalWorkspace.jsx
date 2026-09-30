import React from 'react';
import { supabase } from '../../lib/supabase.js';
import {
  saveEngagementProposal, sendEngagementProposal, withdrawEngagementProposal, unsendEngagementProposal,
  blankProposalForm, viewToForm, validateProposalForm, validateForSend, sendWarnings, sendChecklist, loadProposalActivity,
} from '../../lib/adminEngagement.js';
import { notifyProposalSent, replyOnProposal } from '../../lib/engagement.js';
import { validateChangeRequest, fmtDate } from '../../lib/engagementGate.js';
import {
  PLAN_TEMPLATES, COMPARE_ROW_DEFS, SECTION_DEFS, normalizePlans, pickPlan, visiblePlans, fmtUSD, dueAtStart, roiFor, longDate,
  isExpired, agreementDocument, marketsFor, vimeoId,
} from '../../lib/proposalPlans.js';
import { ThreadMessage } from '../ThreadMessage.jsx';
import { OUTCOME_KEYS } from '../../lib/proposalContent.js';
import { MODULES } from '../../lib/engagementCatalog.js';
import AgreementModal from '../proposal/AgreementModal.jsx';
import { LOCATION_TAGS } from './ClientTabs.jsx';

const { useState, useEffect, useMemo } = React;

// The Proposal tab of the Manage Clients workspace: pill sub-tabs
// (Overview · Plans & pricing · Content · Agreement) editing one form, and the
// right rail (actions, "Client will see" + send checklist, activity, thread).
// Once accepted the first sub-tab becomes Plan and shows the signed plan.

const MARKET_COLORS = ['#f5d880', '#a1c8e7', '#aed7d0', '#d9356e', '#604a74'];
const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const Check = ({ color = '#381c4f', size = 10 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;

function Field({ label, hint, error, children, span, style }) {
  return (
    <label style={{ display: 'block', gridColumn: span ? '1 / -1' : undefined, ...style }}>
      <span className="lbl">{label}</span>
      {children}
      {error ? <div className="err">{error}</div> : hint ? <span className="help">{hint}</span> : null}
    </label>
  );
}

export default function ProposalWorkspace({ accountId, company, shortName, locations, invites, view, onChanged, subTab, setSubTab, registerActions, onFeedback }) {
  const [form, setForm] = useState(() => (view ? viewToForm(view) : blankProposalForm({ company, locations })));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [notifyOwners, setNotifyOwners] = useState(true);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [activity, setActivity] = useState([]);
  const [uid, setUid] = useState(null);

  useEffect(() => { if (onFeedback) onFeedback(err ? 'err' : 'ok', err || note); }, [note, err]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { supabase.auth.getUser().then((r) => setUid((r && r.data && r.data.user && r.data.user.id) || null)).catch(() => {}); }, []);
  useEffect(() => { setForm(view ? viewToForm(view) : blankProposalForm({ company, locations })); setErrors({}); setErr(''); setNote(''); }, [view && view.id, view && view.updatedAt, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!accountId) return; loadProposalActivity(accountId, view).then(setActivity).catch(() => setActivity([])); }, [accountId, view && view.updatedAt, view && view.thread && view.thread.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = view ? view.status : 'draft';
  const accepted = status === 'accepted';
  const set = (k) => (val) => { setForm((f) => ({ ...f, [k]: val })); setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x)); };
  const cls = (k) => `in${errors[k] ? ' bad' : ''}`;
  const plansNorm = normalizePlans(form.plans);
  const rec = pickPlan(plansNorm);
  const locNames = (Array.isArray(locations) ? locations : []).map((l) => (l && l.name) || l).filter(Boolean);
  const checklist = sendChecklist(form, invites);
  const missingLegal = checklist.filter((c) => (c.key === 'legal' || c.key === 'entity') && !c.ok).length + (checklist.find((c) => c.key === 'entity' && !c.ok) ? 0 : 0);
  const legalMissingCount = ['clientLegalName', 'clientEntityType', 'clientAddress'].filter((k) => !String(form[k] || '').trim()).length;
  const roi = rec ? roiFor({ monthly: rec.monthly, feePerDoor: Number(form.roiFeePerDoor), doors: Number(form.roiDoorsPerCommunity) }) : null;
  const roiLine = roi && roi.communities ? `${roi.communities} ${roi.label} covers the fee` : '—';

  // ── plans editor ─────────────────────────────────────────────────────────
  const setPlan = (i, k, val) => setForm((f) => ({ ...f, plans: f.plans.map((p, j) => (j === i ? { ...p, [k]: val } : p)) }));
  const setRecommended = (i) => setForm((f) => ({ ...f, plans: f.plans.map((p, j) => ({ ...p, recommended: j === i, show: j === i ? true : p.show })) }));
  const addPlan = () => setForm((f) => {
    if (f.plans.length >= 3) return f;
    const tpl = PLAN_TEMPLATES[f.plans.length] || PLAN_TEMPLATES[PLAN_TEMPLATES.length - 1];
    const used = new Set(f.plans.map((p) => p.key)); let key = tpl.key; while (used.has(key)) key += '-2';
    return { ...f, plans: [...f.plans, { ...tpl, key, recommended: f.plans.length === 0, show: true }] };
  });
  const removePlan = (i) => setForm((f) => { const plans = f.plans.filter((_, j) => j !== i); if (plans.length && !plans.some((p) => p.recommended)) plans[0] = { ...plans[0], recommended: true }; return { ...f, plans }; });
  const toggleMarket = (name) => setForm((f) => ({ ...f, markets: f.markets.includes(name) ? f.markets.filter((m) => m !== name) : [...f.markets, name] }));

  // ── actions ──────────────────────────────────────────────────────────────
  const validateOrExplain = (forSend) => {
    const r = forSend ? validateForSend(form) : validateProposalForm(form);
    setErrors(r.errors);
    if (!r.ok) setErr(forSend ? 'The agreement needs a few things before this can go out — see the highlighted fields (Agreement tab).' : 'Check the highlighted fields.');
    return r.ok;
  };
  const save = async () => {
    if (!validateOrExplain(false)) return null;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: view ? view.id : null, accountId, userId: uid, form, shortName: shortName || company, currentRef: view ? view.ref : '' });
      onChanged(saved);
      setNote(saved.status === 'sent' ? 'Saved. The client sees the update immediately (same version until you re-send).' : accepted ? 'Plan changes saved.' : `Draft ${saved.ref} saved. Not visible to the client until you send it.`);
      return saved;
    } catch (e) { setErr(String((e && e.message) || e)); return null; }
    finally { setBusy(false); }
  };
  const send = async () => {
    const hardMissing = checklist.filter((c) => c.hard && !c.ok);
    if (hardMissing.length) { setErrors(validateForSend(form).errors); setErr(`Before sending: ${hardMissing.map((c) => c.label.toLowerCase()).join(', ')}.`); return; }
    if (!validateOrExplain(true)) return;
    const warnings = sendWarnings(form);
    if (!checklist.find((c) => c.key === 'owner').ok) warnings.unshift('No owner invited yet — nobody can accept until you add one (Team & access).');
    const resend = status === 'sent';
    const ok = window.confirm(
      `${resend ? 'Re-send' : 'Send'} this proposal to ${company}?\n\n${resend ? 'The version bumps to v' + ((view.version || 1) + 1) + '. ' : ''}Their portal will be LOCKED to the proposal until their owner reads the agreement and accepts. Valid for ${form.validDays || 30} days.` +
      (warnings.length ? `\n\nHeads up:\n• ${warnings.join('\n• ')}` : '') + (notifyOwners ? '\n\nThe account owner(s) will be emailed that it is ready.' : ''),
    );
    if (!ok) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const saved = await saveEngagementProposal({ id: view ? view.id : null, accountId, userId: uid, form, shortName: shortName || company, currentRef: view ? view.ref : '' });
      const sent = await sendEngagementProposal({ id: saved.id, userId: uid, currentStatus: saved.status, currentVersion: saved.version, validDays: form.validDays });
      let extra = '';
      if (notifyOwners) {
        try { const r = await notifyProposalSent(sent.id); extra = r.sent ? ` Emailed ${r.sent} owner${r.sent === 1 ? '' : 's'}.` : ` ${r.note || 'No owner email was sent.'}`; }
        catch (e) { extra = ` (Owner email failed: ${String((e && e.message) || e)})`; }
      }
      onChanged(sent);
      setNote(`Sent as v${sent.version}, valid through ${fmtDate(sent.validThrough)}.${extra}`);
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };
  const unsend = async () => {
    if (!window.confirm(`Take the proposal back to Draft?\n\n${company}'s portal unlocks; nothing is deleted.`)) return;
    setBusy(true); setErr(''); setNote('');
    try { onChanged(await unsendEngagementProposal(view.id)); setNote('Back to draft. The portal is open again.'); } catch (e) { setErr(String((e && e.message) || e)); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!window.confirm(`Withdraw this proposal for ${company}?\n\nKept for the record; the portal unlocks and you can create a new one.`)) return;
    setBusy(true); setErr(''); setNote('');
    try { await withdrawEngagementProposal(view.id); onChanged(null); setNote('Withdrawn.'); } catch (e) { setErr(String((e && e.message) || e)); } finally { setBusy(false); }
  };
  const sendReply = async () => {
    const r = validateChangeRequest(reply); if (!r.ok) { setErr(r.error); return; }
    setReplyBusy(true); setErr('');
    try { const res = await replyOnProposal({ proposalId: view.id, message: r.message }); setReply(''); onChanged(); setNote(res && res.to && res.to.length ? `Reply posted and emailed to ${res.to.join(', ')}.` : 'Reply posted.'); }
    catch (e) { setErr(String((e && e.message) || e)); } finally { setReplyBusy(false); }
  };
  // Header/rail buttons live outside this component; hand them the handlers.
  useEffect(() => { registerActions && registerActions({ save, send, busy, status, sendLabel: accepted ? 'Save plan changes' : status === 'sent' ? `Save & re-send (v${(view.version || 1) + 1})` : 'Send to client' }); }, [form, busy, status, view, notifyOwners, invites]); // eslint-disable-line react-hooks/exhaustive-deps

  const agreement = useMemo(() => agreementDocument({
    ref: view ? view.ref : '', clientLegalName: form.clientLegalName, clientEntityType: form.clientEntityType, clientAddress: form.clientAddress,
    effectiveDate: form.startDate, plan: rec, markets: marketsFor(form.markets.length ? form.markets : locNames, rec).named, spoc: form.spoc,
  }), [form, rec, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const subTabs = [['overview', accepted ? 'Plan' : 'Overview'], ['plans', 'Plans & pricing'], ['content', 'Content'], ['agreement', 'Agreement']];
  const previewHref = `/c/${accountId}/?as=client`;
  const shown = visiblePlans(plansNorm);
  const acceptedPlan = accepted ? (pickPlan(view.plans, view.acceptedPlanKey) || rec) : null;

  return (
    <>
      <div className="adm-main" data-testid="adm-proposal">
        <div className="adm-subtabs">
          {subTabs.map(([k, l]) => (
            <button type="button" key={k} className={`adm-subtab${subTab === k ? ' on' : ''}`} onClick={() => setSubTab(k)} data-testid={`adm-subtab-${k}`}>
              {l}{k === 'agreement' && legalMissingCount ? <span className="badge">{legalMissingCount} missing</span> : null}
            </button>
          ))}
        </div>

        {/* ── Plan (accepted) ── */}
        {subTab === 'overview' && accepted && acceptedPlan ? (
          <>
            <div className="adm-plan-panel" data-testid="adm-plan-panel">
              <div className="stripes" style={{ display: 'flex', height: 5 }}><i style={{ flex: 1, background: '#d9356e' }} /><i style={{ flex: 1, background: '#f5d880' }} /><i style={{ flex: 1, background: '#a1c8e7' }} /><i style={{ flex: 1, background: '#aed7d0' }} /><i style={{ flex: 1, background: '#604a74' }} /></div>
              <div className="top">
                <div style={{ minWidth: 0 }}>
                  <div className="eb">Active plan · accepted {fmtDate(view.acceptedAt)}</div>
                  <div className="name"><b>{acceptedPlan.name}</b><span>{acceptedPlan.locations} location{acceptedPlan.locations === 1 ? '' : 's'} · {acceptedPlan.termMonths} months</span></div>
                </div>
                <div className="money"><b>{fmtUSD(acceptedPlan.monthly)}<small> / MO</small></b><div>{fmtUSD(acceptedPlan.setup)} setup · ACH on the 1st</div></div>
              </div>
              <div className="adm-plan-facts">
                {[['Term', `${acceptedPlan.termMonths} months`], ['Start', view.startDate ? longDate(view.startDate) : '—'], ['Setup', fmtUSD(acceptedPlan.setup)], ['Guarantee', acceptedPlan.guarantee ? 'Included' : '—'], ['Exclusivity', acceptedPlan.exclusive ? 'Included' : '—'], ['Referral discount', acceptedPlan.referralDiscount ? `−${fmtUSD(acceptedPlan.referralDiscount)} / mo` : '—']].map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
              </div>
            </div>
            <div className="adm-3">
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 12 }}>Included</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['Results Guarantee', acceptedPlan.guarantee], ['Market exclusivity', acceptedPlan.exclusive], ['Growth Portal, every seat', true], ['Referral discount', acceptedPlan.referralDiscount > 0], ['Quarterly playbook & report', true], ['Monthly reporting', true]].map(([l, on]) => (
                    <div key={l} className={`adm-inc${on ? '' : ' off'}`}><span className="ck">{on ? <Check /> : null}</span>{l}</div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 12 }}>Markets on this plan</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {marketsFor(view.markets.length ? view.markets : locNames, acceptedPlan).named.map((m, i) => {
                    const loc = (locations || []).find((l) => (l && l.name) === m) || {};
                    const tag = LOCATION_TAGS.find((t) => t.value === loc.tag) || LOCATION_TAGS[2];
                    return <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--a-purple)' }}><i style={{ width: 8, height: 8, borderRadius: 999, background: MARKET_COLORS[i % MARKET_COLORS.length], display: 'inline-block' }} />{m}</span><span className={`pill ${tag.cls}`}>{tag.label}</span></div>;
                  })}
                </div>
              </div>
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 12 }}>Signed</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--a-purple)' }}>{view.acceptedName}{view.acceptedTitle ? `, ${view.acceptedTitle}` : ''}</div>
                <div className="help" style={{ margin: '2px 0 0' }}>for {view.clientLegalName || company} · {fmtWhen(view.acceptedAt)} · v{view.acceptedVersion}{view.hasAgreementSnapshot ? ' · agreement snapshot on file' : ''}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-o" style={{ padding: '9px 12px', fontSize: 11 }} onClick={() => setAgreementOpen(true)}>Agreement</button>
                  <a className="btn-g" href={previewHref} target="_blank" rel="noopener noreferrer">Proposal v{view.acceptedVersion}</a>
                </div>
              </div>
            </div>
            <div className="card adm-billing">
              <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--a-purple)' }}>Billing</div><div className="help" style={{ margin: '2px 0 0' }}>{fmtUSD(acceptedPlan.monthly)} monthly by ACH autopay. Start and stop the draft under Profile → Billing.</div></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-g" disabled title="Coming soon">Change plan</button>
                <button type="button" className="btn-g pink" disabled title="Coming soon">Pause / cancel</button>
              </div>
            </div>
          </>
        ) : null}

        {/* ── Overview ── */}
        {subTab === 'overview' && !accepted ? (
          <>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Cover</div>
              <div className="grid220">
                <Field label="Title" span error={errors.title}><input className={cls('title')} value={form.title} onChange={(e) => set('title')(e.target.value)} style={{ fontSize: 15, fontWeight: 700 }} /></Field>
                <Field label="Intro (client-facing)" span hint="Blank line = new paragraph."><textarea className="in" rows={3} value={form.intro} onChange={(e) => set('intro')(e.target.value)} /></Field>
                <Field label="Start date" error={errors.startDate}><input className={cls('startDate')} type="date" value={form.startDate} onChange={(e) => set('startDate')(e.target.value)} /></Field>
                <Field label="Valid for (days)" error={errors.validDays}><input className={cls('validDays')} type="number" min="1" value={form.validDays} onChange={(e) => set('validDays')(e.target.value)} /></Field>
                <Field label="Prepared by" hint="Blank = whoever clicks Send."><input className="in" value={form.preparedByName} onChange={(e) => set('preparedByName')(e.target.value)} placeholder="Skyler Nelson" /></Field>
                <Field label="Closing (above Next steps)" span><textarea className="in" rows={2} value={form.closing} onChange={(e) => set('closing')(e.target.value)} /></Field>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><div className="eyebrow">Markets in this proposal</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>From client locations · {form.markets.length} selected</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="adm-markets">
                {locNames.map((n, i) => { const loc = (locations || [])[i] || {}; const on = form.markets.includes(n); return <button type="button" key={n} className={`adm-chip${on ? ' on' : ''}`} onClick={() => toggleMarket(n)} aria-pressed={on}><i style={{ background: MARKET_COLORS[i % MARKET_COLORS.length] }} />{n}{loc.hq ? <span className="hq">HQ</span> : null}</button>; })}
                {!locNames.length ? <span className="help" style={{ margin: 0 }}>Add locations on the Locations tab first.</span> : null}
              </div>
              {errors.markets ? <div className="err">{errors.markets}</div> : null}
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Pays-for-itself defaults</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, alignItems: 'end' }}>
                <Field label="Fee per door / mo" error={errors.roiFeePerDoor}><input className={cls('roiFeePerDoor')} inputMode="decimal" value={form.roiFeePerDoor} onChange={(e) => set('roiFeePerDoor')(e.target.value)} /></Field>
                <Field label="Doors / community" error={errors.roiDoorsPerCommunity}><input className={cls('roiDoorsPerCommunity')} type="number" min="1" value={form.roiDoorsPerCommunity} onChange={(e) => set('roiDoorsPerCommunity')(e.target.value)} /></Field>
                <div className="adm-roi-line"><div className="k">Client sees</div><div className="v" data-testid="adm-roi-line">{roiLine}{rec ? ` · at ${rec.name}` : ''}</div></div>
              </div>
            </div>
          </>
        ) : null}

        {/* ── Plans & pricing ── */}
        {subTab === 'plans' ? (
          <>
            {errors.plans ? <div className="err">{errors.plans}</div> : null}
            <div className="adm-plans">
              {form.plans.map((p, i) => {
                const isRec = !!p.recommended;
                const flags = [['guarantee', 'Results Guarantee', !!p.guarantee, () => setPlan(i, 'guarantee', !p.guarantee)], ['exclusive', 'Market exclusivity', !!p.exclusive, () => setPlan(i, 'exclusive', !p.exclusive)], ['portal', 'Growth Portal', true, null], ['referral', 'Referral discount', Number(p.referralDiscount) > 0, () => setPlan(i, 'referralDiscount', Number(p.referralDiscount) > 0 ? 0 : 150)]];
                return (
                  <div key={i} className={`adm-plan${p.show === false ? ' hidden' : ''}`} data-testid={`adm-plan-${i}`}>
                    <div className={`adm-plan-head${isRec ? ' rec' : ''}`}>
                      <input value={p.name} onChange={(e) => setPlan(i, 'name', e.target.value)} placeholder="Plan name" data-testid={`adm-plan-${i}-name`} />
                      <button type="button" className={`sw${p.show !== false ? ' on' : ''}`} onClick={() => setPlan(i, 'show', p.show === false)} title="Show on proposal" aria-label="Show on proposal" aria-pressed={p.show !== false} />
                    </div>
                    <div className="adm-plan-body">
                      <div className="adm-plan-grid">
                        <Field label="Monthly"><input className="in sm" inputMode="decimal" value={p.monthly} onChange={(e) => setPlan(i, 'monthly', e.target.value)} /></Field>
                        <Field label="Setup"><input className="in sm" inputMode="decimal" value={p.setup} onChange={(e) => setPlan(i, 'setup', e.target.value)} /></Field>
                        <Field label="Locations"><input className="in sm" type="number" min="1" value={p.locations} onChange={(e) => setPlan(i, 'locations', e.target.value)} /></Field>
                        <Field label="Term (months)"><input className="in sm" type="number" min="1" value={p.termMonths} onChange={(e) => setPlan(i, 'termMonths', e.target.value)} /></Field>
                      </div>
                      <input className="in sm" value={p.tagline || ''} onChange={(e) => setPlan(i, 'tagline', e.target.value)} placeholder="Tagline, e.g. Three markets" />
                      <div className="adm-flags">
                        {flags.map(([k, l, on, toggle]) => (
                          <button type="button" key={k} className={`adm-flag${on ? ' on' : ''}${toggle ? '' : ' fixed'}`} onClick={toggle || undefined} aria-pressed={on}><span>{l}{k === 'referral' && on ? ` · −${fmtUSD(p.referralDiscount)}/mo` : ''}</span><span className="box">{on ? <Check color="#fff" size={11} /> : null}</span></button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <button type="button" className={`adm-rec${isRec ? ' on' : ''}`} onClick={() => setRecommended(i)}><span className="r" />Recommended</button>
                        <span className="help" style={{ margin: 0 }}>Due at start {fmtUSD(dueAtStart({ monthly: Number(String(p.monthly).replace(/[$,]/g, '')) || 0, setup: Number(String(p.setup).replace(/[$,]/g, '')) || 0 }))}</span>
                        <button type="button" className="link pink" onClick={() => removePlan(i)}>Remove</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {form.plans.length < 3 ? <button type="button" className="btn-g" onClick={addPlan} data-testid="adm-plan-add">+ Add plan</button> : null}
              <button type="button" className="link" onClick={() => { if (window.confirm('Replace the plans with the three standard tiers?')) set('plans')(PLAN_TEMPLATES.map((p) => ({ ...p }))); }}>Standard tiers</button>
            </div>
            <div className="card">
              <div className="card-head"><div className="eyebrow">Comparison rows</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>Toggle to show</span></div>
              <div className="adm-rowlist">
                {COMPARE_ROW_DEFS.map((r) => { const on = form.compareRows[r.key] !== false; return (
                  <div key={r.key} className={`adm-rowitem${on ? '' : ' off'}`}>
                    <div style={{ flex: 1, minWidth: 0 }}><div className="t">{r.label}</div><div className="d">{r.note({ exclusivityMiles: Number(form.exclusivityMiles) || 16 })}</div></div>
                    {r.key === 'exclusivity' ? <input className="in sm" type="number" min="1" value={form.exclusivityMiles} onChange={(e) => set('exclusivityMiles')(e.target.value)} style={{ width: 80 }} title="Exclusivity radius (miles)" /> : null}
                    <button type="button" className={`sw${on ? ' on' : ''}`} onClick={() => set('compareRows')({ ...form.compareRows, [r.key]: !on })} aria-pressed={on} aria-label={`Show ${r.label}`} />
                  </div>
                ); })}
              </div>
              {errors.exclusivityMiles ? <div className="err">{errors.exclusivityMiles}</div> : null}
            </div>
          </>
        ) : null}

        {/* ── Content ── */}
        {subTab === 'content' ? (
          <>
            <div className="card">
              <div className="card-head"><div className="eyebrow">Sections</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>Toggle what the client sees</span></div>
              <div className="adm-rowlist">
                {SECTION_DEFS.map((s) => { const on = form.sections[s.key] !== false; return (
                  <div key={s.key} className={`adm-rowitem${on ? '' : ' off'}`} data-testid={`adm-section-${s.key}`}>
                    <span className="num">{s.n}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div className="t">{s.label}</div><div className="d">{s.note}</div></div>
                    {s.key === 's1' || s.key === 's6' ? <button type="button" className="btn-g" onClick={() => setSubTab('overview')}>Edit</button> : null}
                    <button type="button" className={`sw${on ? ' on' : ''}`} onClick={() => set('sections')({ ...form.sections, [s.key]: !on })} aria-pressed={on} aria-label={`Show ${s.label}`} />
                  </div>
                ); })}
              </div>
            </div>
            <div className="card" data-testid="adm-outcomes">
              <div className="card-head"><div className="eyebrow">What you get · the four outcome cards</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>Modules become the chips</span></div>
              <div className="card-sub">One card per engine. Switch a card off to drop it; tick the modules this engagement includes — they appear as chips on the card and drive the agreement's scope.</div>
              <div className="grid220">
                {OUTCOME_KEYS.map((o) => { const on = form.sections[o.key] !== false; const mods = MODULES.filter((m) => m.engine === o.engine); return (
                  <div key={o.key} className={`adm-rowitem${on ? '' : ' off'}`} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }} data-testid={`adm-outcome-${o.engine}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="t">{o.tag}</div><div className="d">{o.title}</div></div>
                      <button type="button" className={`sw${on ? ' on' : ''}`} onClick={() => set('sections')({ ...form.sections, [o.key]: !on })} aria-pressed={on} aria-label={`Show ${o.tag}`} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                      {mods.map((m) => { const mon = form.modules.includes(m.key); return (
                        <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: mon ? 'var(--a-purple)' : 'var(--a-muted)', fontWeight: mon ? 700 : 500, cursor: 'pointer' }} data-testid={`adm-module-${m.key}`}>
                          <input type="checkbox" checked={mon} onChange={() => set('modules')(mon ? form.modules.filter((k) => k !== m.key) : [...form.modules, m.key])} /> {m.name}
                        </label>
                      ); })}
                    </div>
                  </div>
                ); })}
              </div>
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Proof &amp; reference</div>
              <div className="grid220">
                <Field label="Testimonial video (Vimeo URL or id)" error={errors.testimonialVimeoId} hint={vimeoId(form.testimonialVimeoId) ? `Embeds video ${vimeoId(form.testimonialVimeoId)}` : 'Leave blank for documents only.'}><input className={cls('testimonialVimeoId')} value={form.testimonialVimeoId} onChange={(e) => set('testimonialVimeoId')(e.target.value)} placeholder="https://vimeo.com/1131397045" /></Field>
                <Field label="Caption"><input className="in" value={form.testimonialCaption} onChange={(e) => set('testimonialCaption')(e.target.value)} placeholder="Client testimonial · 2:58" /></Field>
                <Field label="Documents · one per line" span error={errors.linksText} hint={<>Label | URL. A bare URL gets a label from its filename.</>}><textarea className={`${cls('linksText')} mono`} rows={3} value={form.linksText} onChange={(e) => set('linksText')(e.target.value)} placeholder={'Q3 2026 Growth Playbook | https://view.alloygp.co/<client>/playbook/….html'} /></Field>
                <Field label="Welcome-call scheduling link" span error={errors.welcomeCallUrl} hint="Shown after they accept."><input className={cls('welcomeCallUrl')} value={form.welcomeCallUrl} onChange={(e) => set('welcomeCallUrl')(e.target.value)} placeholder="https://…" /></Field>
              </div>
            </div>
          </>
        ) : null}

        {/* ── Agreement ── */}
        {subTab === 'agreement' ? (
          <>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Client legal details</div>
              <div className="grid220">
                <Field label="Legal name" error={errors.clientLegalName}><input className={cls('clientLegalName')} value={form.clientLegalName} onChange={(e) => set('clientLegalName')(e.target.value)} placeholder="Community Management, LLC" /></Field>
                <Field label="Entity type" error={errors.clientEntityType}><input className={cls('clientEntityType')} value={form.clientEntityType} onChange={(e) => set('clientEntityType')(e.target.value)} placeholder="Louisiana limited liability company" /></Field>
                <Field label="Principal place of business" span error={errors.clientAddress}><input className={cls('clientAddress')} value={form.clientAddress} onChange={(e) => set('clientAddress')(e.target.value)} placeholder="Street, City, ST ZIP" /></Field>
                <Field label="Point of contact (SPOC)" hint="Named in Sec. 16 until the owner signs; the signer replaces it."><input className="in" value={form.spoc} onChange={(e) => set('spoc')(e.target.value)} placeholder="Jeff Harman, CEO" /></Field>
                <Field label="Agreement ref" hint="Minted when the draft is first saved."><input className="in" value={view ? view.ref : ''} readOnly placeholder="On first save" /></Field>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><div className="eyebrow">Terms pulled from the recommended plan</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>Edit these on Plans &amp; pricing</span></div>
              <div className="adm-facts">
                {rec ? [['Investment Track', rec.name], ['Monthly fee', `${fmtUSD(rec.monthly)} / month`], ['Setup', fmtUSD(rec.setup)], ['Term', `${rec.termMonths} months`], ['Growth Guarantee', rec.guarantee ? 'Included (8.8)' : 'Not included'], ['Exclusivity', rec.exclusive ? 'Included (3.2)' : 'Not included']].map(([k, v]) => <div key={k} className="adm-fact"><div className="k">{k}</div><div className="v">{v}</div></div>) : <div className="help">Add a plan first.</div>}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn-o" onClick={() => setAgreementOpen(true)} data-testid="adm-preview-agreement">Preview agreement</button>
              </div>
            </div>
          </>
        ) : null}

        {err ? <div className="err" data-testid="adm-proposal-err">{err}</div> : null}
      </div>

      {/* ── right rail ── */}
      <div className="adm-rail" data-testid="adm-rail">
        <div className="adm-rail-acts">
          {view ? <a className="btn-o" href={previewHref} target="_blank" rel="noopener noreferrer">Preview as client</a> : null}
          {!accepted ? <button type="button" className="btn-p glow" onClick={send} disabled={busy} data-testid="adm-send">{status === 'sent' ? `Save & re-send (v${(view.version || 1) + 1})` : 'Send to client'}</button> : null}
        </div>
        {!accepted ? (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, color: 'var(--a-body)' }}><input type="checkbox" checked={notifyOwners} onChange={(e) => setNotifyOwners(e.target.checked)} /> Email the owner(s) when sent</label>
        ) : null}
        <div className="adm-see" data-testid="adm-see">
          <div className="eb">Client will see</div>
          {rec ? (
            <>
              <div className="plan">{rec.name} plan · {rec.locations} location{rec.locations === 1 ? '' : 's'}</div>
              <div className="money"><b>{fmtUSD(rec.monthly)}</b><span>/ MO</span></div>
              <div className="sub">{fmtUSD(rec.setup)} setup · {rec.termMonths} months · {shown.length} plan{shown.length === 1 ? '' : 's'} shown{form.startDate ? ` · starts ${longDate(form.startDate)}` : ''}</div>
            </>
          ) : <div className="sub">No plan yet.</div>}
          <div className="adm-check">
            {checklist.map((c) => <div key={c.key} className={c.ok ? 'ok' : ''} data-testid={`adm-check-${c.key}`}><span className="c">{c.ok ? <Check size={9} /> : null}</span>{c.label}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activity.length ? activity.map((a, i) => <div key={i} className="adm-act"><i style={{ background: a.color }} /><div style={{ minWidth: 0 }}><div className="w">{a.what}</div><div className="t">{fmtWhen(a.at)}</div></div></div>) : <div className="help" style={{ margin: 0 }}>{view ? 'Nothing yet. Views, agreement opens and acceptance show up here.' : 'Send the proposal to start the trail.'}</div>}
          </div>
        </div>
        {view ? (
          <div className="card" data-testid="adm-thread">
            <div className="card-head" style={{ marginBottom: 12 }}><div className="eyebrow">Thread</div>{view.thread.length ? <span className="pill pink" style={{ padding: '3px 8px' }}>{view.thread.length}</span> : null}</div>
            {view.thread.length ? <div className="eg-thread">{view.thread.map((m, i) => <ThreadMessage key={i} m={m} mine={m.role === 'staff'} />)}</div> : <div className="help" style={{ margin: '0 0 10px' }}>Questions the client asks on the proposal page land here.</div>}
            {status !== 'draft' ? <div className="send"><textarea className="in sm" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" /><button type="button" className="btn-o" style={{ padding: '0 12px' }} onClick={sendReply} disabled={replyBusy || !reply.trim()}>Send</button></div> : null}
          </div>
        ) : null}
        {view && !accepted ? (
          <div className="adm-rail-links">
            {status === 'sent' ? <button type="button" className="link" onClick={unsend} disabled={busy}>Back to draft</button> : <span />}
            <button type="button" className="link pink" onClick={withdraw} disabled={busy}>Withdraw proposal</button>
          </div>
        ) : null}
      </div>

      {agreementOpen ? <AgreementModal doc={agreement} onClose={() => setAgreementOpen(false)} onAgree={() => setAgreementOpen(false)} canAgree={false} /> : null}
    </>
  );
}
