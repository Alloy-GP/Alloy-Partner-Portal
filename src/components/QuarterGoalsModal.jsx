import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { submitQuarterGoals, currentQuarterLabel } from '../lib/goals.js';

const { useState, useEffect } = React;

// In-portal quarterly-goals form. Opened from a `goals`-tagged ticket's "Open
// Q{n} Form" button. Same shape as the public /goals page, but identity is
// prefilled from the authed account so the client only shares goals + what's in
// the way. On submit it emails the Alloy team via `submit-quarter-goals`.
export default function QuarterGoalsModal({ onClose, onSubmitted }) {
  const quarter = currentQuarterLabel();
  const [form, setForm] = useState({ wins: '', goals: '', challenges: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const who = [DATA.user && DATA.user.name, DATA.account && DATA.account.company].filter(Boolean).join(' · ');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!form.goals.trim() || !form.challenges.trim()) {
      setErr('Tell us your top goals and what’s getting in the way.');
      return;
    }
    setBusy(true); setErr('');
    try {
      await submitQuarterGoals(form);
      setBusy(false);
      setDone(true);
      onSubmitted && onSubmitted();
    } catch (e) {
      setBusy(false);
      setErr(String((e && e.message) || e || 'Something went wrong.'));
    }
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && onClose()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="Quarterly goals"
        onClick={(e) => e.stopPropagation()} style={{ width: 540, maxHeight: '88vh', overflowY: 'auto' }}>
        {done ? (
          <>
            <div className="nr-head">
              <div>
                <div className="nr-kicker">Planning · {quarter}</div>
                <div className="nr-title">Thank you — we’ve got it.</div>
              </div>
              <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 4px' }}>
              Your {quarter} goals are on their way to your Alloy team. We’ll use them to shape your pre-planning and follow up with you shortly.
            </p>
            <div className="nr-foot">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="nr-head">
              <div>
                <div className="nr-kicker">Planning · {quarter}</div>
                <div className="nr-title">Help us wrap up your {quarter} plan</div>
              </div>
              <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
            </div>

            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 2px' }}>
              Tell us what worked, what you want to accomplish in <strong>{quarter}</strong>, and what’s getting in the way — your Alloy team will use this to build your plan before we meet.
            </p>
            {who ? (
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '6px 0 2px' }}>
                Submitting as <strong style={{ color: 'var(--fg-3)' }}>{who}</strong>
              </div>
            ) : null}

            <label className="nr-field">
              <span className="nr-label">What worked well last quarter?</span>
              <textarea className="input" rows={3} value={form.wins} onChange={set('wins')} autoFocus
                placeholder="Wins, momentum, what you’d like to keep doing…" style={{ resize: 'vertical' }} />
            </label>

            <label className="nr-field">
              <span className="nr-label">Top goals for {quarter} *</span>
              <textarea className="input" rows={5} value={form.goals} onChange={set('goals')}
                placeholder="e.g. Grow qualified leads by 20%, launch the new service page, improve rankings in the north market…" style={{ resize: 'vertical' }} />
            </label>

            <label className="nr-field">
              <span className="nr-label">Challenges — what’s getting in the way? *</span>
              <textarea className="input" rows={4} value={form.challenges} onChange={set('challenges')}
                placeholder="e.g. Not enough time, unclear where to invest, last quarter’s campaign underperformed…" style={{ resize: 'vertical' }} />
            </label>

            {err ? <div className="nr-err">{err}</div> : null}
            <div className="nr-foot">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send my goals'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
