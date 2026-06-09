import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Login.css';

// TEMPORARY build-time gate: only Alloy team members can sign in while the
// portal is under construction. Set to null (and this becomes a no-op) once
// client accounts go live — real per-account access is the Phase 2 RLS work.
const ALLOWED_EMAIL_DOMAIN = 'alloygp.co';

/**
 * Magic-link login screen.
 *
 * Email in → supabase.auth.signInWithOtp sends a one-time magic link →
 * the user clicks it → they land back on the app origin with a session
 * (picked up by detectSessionInUrl in src/lib/supabase.js).
 */
function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;

    // Temporary gate — see ALLOWED_EMAIL_DOMAIN above.
    if (ALLOWED_EMAIL_DOMAIN && !value.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      setStatus('error');
      setError(`The portal is still in setup — sign-in is limited to @${ALLOWED_EMAIL_DOMAIN} addresses for now.`);
      return;
    }

    setStatus('sending');
    setError('');

    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: window.location.origin },
    });

    if (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong. Try again.');
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />

      <div className="login-card">
        <img
          className="login-logo"
          src="/assets/alloy-logo-full-color.svg"
          alt="Alloy Growth Partners"
        />

        {status === 'sent' ? (
          <div className="login-sent">
            <div className="login-sent-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
            </div>
            <h1>Check your inbox</h1>
            <p>
              We sent a magic link to <strong>{email}</strong>. Click it to sign
              in — no password needed.
            </p>
            <button
              type="button"
              className="login-link-btn"
              onClick={() => { setStatus('idle'); setEmail(''); }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1>Partner portal</h1>
            <p className="login-sub">
              Sign in with your work email and we'll send you a secure link.
            </p>

            <form className="login-form" onSubmit={submit}>
              <label htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'sending'}
              />

              {status === 'error' ? (
                <div className="login-error" role="alert">{error}</div>
              ) : null}

              <button
                type="submit"
                className="login-submit"
                disabled={status === 'sending' || !email.trim()}
              >
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          </>
        )}

        <div className="login-foot">
          Trouble signing in? Reach your Alloy team at{' '}
          <a href="mailto:hello@alloygp.co">hello@alloygp.co</a>
        </div>
      </div>
    </div>
  );
}

export default Login;
