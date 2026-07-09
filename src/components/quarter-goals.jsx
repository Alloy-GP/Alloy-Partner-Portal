import React, { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import './quarter-goals.css';

// PUBLIC, shell-less pre-planning intake at /goals. No portal session — the
// client identifies themselves (company + name + email) and shares next
// quarter's goals + challenges. We POST to the `submit-quarter-goals` edge
// function (anon key clears the gateway, same model as the sign-in sender),
// which emails the Alloy team via Resend. Nothing is stored client-side.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The quarter we're collecting FOR — the current calendar quarter (this runs at
// the start of the quarter as a pre-planning intake).
function currentQuarterLabel(now = new Date()) {
  const qi = Math.floor(now.getMonth() / 3); // 0..3
  return `Q${qi + 1} ${now.getFullYear()}`;
}

function QuarterGoalsForm() {
  const quarter = currentQuarterLabel();
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [goals, setGoals] = useState('');
  const [challenges, setChallenges] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — real users leave blank
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!company.trim() || !contactName.trim() || !email.trim() || !goals.trim() || !challenges.trim()) return;
    setStatus('sending');
    setError('');
    try {
      if (!isSupabaseConfigured) throw new Error('This form is not available right now.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-quarter-goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          company: company.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          quarter,
          goals: goals.trim(),
          challenges: challenges.trim(),
          website, // honeypot
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        throw new Error(j.error || 'Something went wrong. Please try again.');
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  const sending = status === 'sending';

  return (
    <div className="qg-page">
      <div className="qg-bg" aria-hidden="true" />

      <div className="qg-card">
        <img className="qg-logo" src="/assets/alloy-logo-full-color.svg" alt="Alloy Growth Partners" />

        {status === 'done' ? (
          <>
            <div className="qg-done-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1>Thank you — we've got it.</h1>
            <p className="qg-sub">
              Your {quarter} goals are on their way to your Alloy team. We'll use
              them to shape your pre-planning and follow up with you shortly.
            </p>
            <div className="qg-foot">
              Need to change something? Email us at{' '}
              <a href="mailto:hello@alloygp.co">hello@alloygp.co</a>.
            </div>
          </>
        ) : (
          <>
            <div className="qg-eyebrow">Planning · {quarter}</div>
            <h1>Help us wrap up your {quarter} plan</h1>
            <p className="qg-sub">
              Tell us what you want to accomplish in <strong>{quarter}</strong> and
              what's getting in the way. Your Alloy team will use this to build
              your plan before we meet.
            </p>

            <form className="qg-form" onSubmit={submit}>
              <div className="qg-field">
                <label htmlFor="qg-company">Company / organization</label>
                <input
                  id="qg-company"
                  type="text"
                  autoComplete="organization"
                  required
                  placeholder="Your company name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={sending}
                />
              </div>

              <div className="qg-row">
                <div className="qg-field">
                  <label htmlFor="qg-name">Your name</label>
                  <input
                    id="qg-name"
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="First and last"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={sending}
                  />
                </div>
                <div className="qg-field">
                  <label htmlFor="qg-email">Email</label>
                  <input
                    id="qg-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={sending}
                  />
                </div>
              </div>

              <div className="qg-field">
                <label htmlFor="qg-goals">
                  Top goals for {quarter} <span className="qg-hint">— what does success look like?</span>
                </label>
                <textarea
                  id="qg-goals"
                  required
                  rows={5}
                  placeholder="e.g. Grow qualified leads by 20%, launch the new service page, improve our Google rankings in the north market…"
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  disabled={sending}
                />
              </div>

              <div className="qg-field">
                <label htmlFor="qg-challenges">
                  Challenges <span className="qg-hint">— what's getting in the way?</span>
                </label>
                <textarea
                  id="qg-challenges"
                  required
                  rows={4}
                  placeholder="e.g. Not enough time, unclear on where to invest, last quarter's campaign underperformed…"
                  value={challenges}
                  onChange={(e) => setChallenges(e.target.value)}
                  disabled={sending}
                />
              </div>

              {/* Honeypot: hidden from humans, catches bots. */}
              <div className="qg-hp" aria-hidden="true">
                <label htmlFor="qg-website">Website</label>
                <input
                  id="qg-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {status === 'error' ? <div className="qg-error" role="alert">{error}</div> : null}

              <button
                type="submit"
                className="qg-submit"
                disabled={sending || !company.trim() || !contactName.trim() || !email.trim() || !goals.trim() || !challenges.trim()}
              >
                {sending ? 'Sending…' : 'Send my goals'}
              </button>
            </form>

            <div className="qg-foot">
              Questions? Reach your Alloy team at{' '}
              <a href="mailto:hello@alloygp.co">hello@alloygp.co</a>.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default QuarterGoalsForm;
