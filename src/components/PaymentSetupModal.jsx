import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { track } from '../lib/track.js';
import { fetchPaymentConfig, tokenizeBankAccount, attachBankAccount } from '../lib/billing.js';
import { ACCOUNT_TYPES, ACH_AGREEMENT_VERSION, achAgreementText, validateBankForm, bankTokenPayload } from '../lib/paymentNudge.js';

const { useState, useEffect } = React;

// Autopay onboarding — the soft nudge. Opens at sign-in for billing-role
// clients with no bank on file (App.jsx), from the persistent banner, and from
// the Account page's "Add bank account". "Remind me later" snoozes it for the
// session; it returns next sign-in until a bank is on file.
//
// PCI: raw routing/account numbers go from this browser straight to Intuit's
// tokens endpoint; only the opaque token reaches our edge function (`attach`).

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function Field({ label, error, children }) {
  return (
    <label className="nr-field">
      <span className="nr-label">{label}</span>
      {children}
      {error ? <span className="pm-field-err" role="alert">{error}</span> : null}
    </label>
  );
}

// `previewOnly` (staff "View as client"): everything renders as the client sees
// it, but Save is locked — a bank can only be authorized by the client's own
// owner/accounting user (NACHA), and the attach endpoint would otherwise bind it
// to the STAFF member's account. No analytics in preview either.
export default function PaymentSetupModal({ onLater, onSaved, onFinish, previewOnly = false }) {
  const company = (DATA.account && DATA.account.company) || '';
  const [form, setForm] = useState({
    name: company, routing: '', account: '', confirm: '', accountType: 'BUSINESS_CHECKING', phone: '', agree: false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };
  const later = () => {
    if (busy) return;
    if (saved) { onFinish && onFinish(); return; }
    if (!previewOnly) track('payment_nudge_dismissed', {});
    onLater && onLater();
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') later(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (previewOnly) { setErr('Staff preview — only the client’s owner or accounting user can add a bank account, from their own sign-in.'); return; }
    const v = validateBankForm(form);
    setErrors(v.errors);
    if (!v.ok) { setErr('Check the highlighted fields.'); return; }
    setBusy(true); setErr('');
    try {
      setStage('Securing your details with Intuit…');
      const cfg = await fetchPaymentConfig();
      const token = await tokenizeBankAccount(cfg.tokenUrl, bankTokenPayload(form));
      setStage('Saving to your account…');
      const method = await attachBankAccount({ token, accountName: form.name.trim(), agreementVersion: ACH_AGREEMENT_VERSION });
      track('payment_setup_completed', { last4: method.last4 || null });
      setSaved(method);
      onSaved && onSaved(method);
    } catch (e) {
      setErr(String((e && e.message) || e || 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false); setStage('');
    }
  };

  const cls = (k) => `input${errors[k] ? ' is-invalid' : ''}`;

  return (
    <div className="nr-scrim" onClick={later}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="Set up autopay" data-testid="pm-setup-modal"
        onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        {saved ? (
          <>
            <div className="nr-head">
              <div>
                <div className="nr-kicker">Autopay</div>
                <div className="nr-title">You’re all set.</div>
              </div>
              <button className="nr-close" onClick={onFinish} aria-label="Close"><I.Close width={14} height={14} /></button>
            </div>
            <div className="pm-done">
              <div className="pm-done-icon"><CheckIcon /></div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--alloy-purple)' }}>
                  {saved.bankName || 'Bank account'} <span className="mono">•••• {saved.last4 || '----'}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.5 }}>
                  On file for {company || 'your account'}. Your Alloy team will confirm your monthly draft amount and date — you’ll see it on your Account page.
                </div>
              </div>
            </div>
            <div className="nr-foot">
              <button className="btn btn-primary" onClick={onFinish}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="nr-head">
              <div>
                <div className="nr-kicker">Autopay · one-time setup</div>
                <div className="nr-title">Add a bank account to activate autopay</div>
              </div>
              <button className="nr-close" onClick={later} aria-label="Remind me later" disabled={busy}><I.Close width={14} height={14} /></button>
            </div>

            {previewOnly ? (
              <div className="pm-secure" style={{ background: 'var(--alloy-yellow-tint, #fff6d6)', color: 'var(--alloy-purple)' }} data-testid="pm-preview-note">
                <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Staff preview</span>
                <span>This is what the client’s owner sees. Only they can add a bank account, from their own sign-in.</span>
              </div>
            ) : null}
            <div className="pm-secure">
              <LockIcon />
              <span>Your details are sent directly to <strong>Intuit (QuickBooks Payments)</strong> and tokenized there. Alloy never sees or stores your routing or account number.</span>
            </div>

            <Field label="Name on the account" error={errors.name}>
              <input className={cls('name')} value={form.name} onChange={set('name')} autoComplete="organization" placeholder="Company or account holder" />
            </Field>

            <div className="pm-grid">
              <Field label="Routing number" error={errors.routing}>
                <input className={cls('routing')} value={form.routing} onChange={set('routing')} inputMode="numeric" autoComplete="off" maxLength={9} placeholder="9 digits" autoFocus />
              </Field>
              <Field label="Account type" error={errors.accountType}>
                <select className={cls('accountType')} value={form.accountType} onChange={set('accountType')}>
                  {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="pm-grid">
              <Field label="Account number" error={errors.account}>
                <input className={cls('account')} value={form.account} onChange={set('account')} inputMode="numeric" autoComplete="off" maxLength={17} placeholder="4–17 digits" />
              </Field>
              <Field label="Confirm account number" error={errors.confirm}>
                <input className={cls('confirm')} value={form.confirm} onChange={set('confirm')} inputMode="numeric" autoComplete="off" maxLength={17} placeholder="Re-enter" />
              </Field>
            </div>

            <Field label="Phone for the account holder" error={errors.phone}>
              <input className={cls('phone')} value={form.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 555-5555" />
            </Field>

            <label className={`pm-agree${errors.agree ? ' is-invalid' : ''}`}>
              <input type="checkbox" checked={form.agree} onChange={set('agree')} />
              <span>
                {achAgreementText(company)}
                <span style={{ display: 'block', marginTop: 4, color: 'var(--fg-muted)' }}>Authorization {ACH_AGREEMENT_VERSION} · revoke anytime by contacting your Alloy team.</span>
              </span>
            </label>
            {errors.agree ? <div className="pm-field-err" role="alert">{errors.agree}</div> : null}

            {err ? <div className="nr-err" role="alert">{err}</div> : null}
            <div className="nr-foot" style={{ alignItems: 'center' }}>
              {stage ? <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginRight: 'auto' }}>{stage}</span> : null}
              <button className="btn btn-secondary" onClick={later} disabled={busy}>Remind me later</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy || previewOnly} title={previewOnly ? 'Preview only' : undefined}>{busy ? 'Saving…' : 'Save bank account'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
