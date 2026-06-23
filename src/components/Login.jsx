import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Login.css';

// Sign-in: email -> our `auth-login` edge function emails a one-time link AND a
// numeric code via Resend (reliable + branded; not Supabase's built-in mailer).
// The user can click the link OR type the code. The code is the bulletproof
// path — corporate email scanners can pre-click and consume a magic link, but
// they can't consume a typed code. Clicking the link lands back on the app with
// a session (detectSessionInUrl); typing the code calls verifyOtp here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpType, setOtpType] = useState('email');
  const [status, setStatus] = useState('idle'); // idle | sending | code | verifying | error
  const [error, setError] = useState('');

  const sendCode = async (value) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ email: value, redirectTo: window.location.origin }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) throw new Error(j.error || 'Could not send your sign-in email. Try again.');
    if (j.otpType) setOtpType(j.otpType);
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setStatus('sending');
    setError('');
    try {
      await sendCode(value);
      setEmail(value);
      setStatus('code');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong. Try again.');
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    const token = code.replace(/\s/g, '');
    if (token.length < 6) return;
    setStatus('verifying');
    setError('');
    // Try the type the sender reported, then fall back across email/magiclink.
    const types = [...new Set([otpType, 'email', 'magiclink'])];
    let lastErr = null;
    for (const type of types) {
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type });
      if (!err) return; // session established -> AuthGate swaps in the app
      lastErr = err;
    }
    setStatus('code');
    setError((lastErr && /expired|invalid/i.test(lastErr.message))
      ? 'That code didn’t work — it may have expired. Send a fresh one below.'
      : (lastErr?.message || 'That code didn’t work. Try again.'));
  };

  const resend = async () => {
    setError(''); setCode('');
    try { await sendCode(email); } catch (err) { setError(err.message); }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />

      <div className="login-card">
        <img className="login-logo" src="/assets/alloy-logo-full-color.svg" alt="Alloy Growth Partners" />

        {status === 'code' || status === 'verifying' ? (
          <>
            <div className="login-sent-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
            </div>
            <h1>Check your email</h1>
            <p className="login-sub">
              We sent a sign-in link and a code to <strong>{email}</strong>.
              Click the link, or enter the code below.
            </p>

            <form className="login-form" onSubmit={submitCode}>
              <label htmlFor="login-code">Sign-in code</label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                autoFocus
                placeholder="Enter the code from your email"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                disabled={status === 'verifying'}
              />

              {error ? <div className="login-error" role="alert">{error}</div> : null}

              <button type="submit" className="login-submit" disabled={status === 'verifying' || code.length < 6}>
                {status === 'verifying' ? 'Verifying…' : 'Sign in'}
              </button>
            </form>

            <div className="login-link-row">
              <button type="button" className="login-link-btn" onClick={resend}>Send a new code</button>
              <span className="login-link-sep" aria-hidden="true">·</span>
              <button type="button" className="login-link-btn" onClick={() => { setStatus('idle'); setEmail(''); setCode(''); setError(''); }}>
                Use a different email
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Growth Portal</h1>
            <p className="login-sub">
              Sign in with your work email — we'll send you a secure link and a code.
            </p>

            <form className="login-form" onSubmit={submitEmail}>
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

              {status === 'error' ? <div className="login-error" role="alert">{error}</div> : null}

              <button type="submit" className="login-submit" disabled={status === 'sending' || !email.trim()}>
                {status === 'sending' ? 'Sending…' : 'Send sign-in email'}
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
