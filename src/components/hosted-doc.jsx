import React, { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { passwordStorageKey, viewerKey, unlockErrorMessage } from '../lib/hostedDoc.js';
import './hosted-doc.css';

// PUBLIC, shell-less, password-gated document at /p/<slug>. For one-off
// standalone HTML documents (e.g. a custom proposal built outside the portal)
// hosted on this domain for review. No portal session: the reader types the
// shared password, the `hosted-doc` edge fn checks it, records the open, and
// returns the full HTML, which renders full-viewport in an isolated
// <iframe srcdoc> (the same way Guides render) so its CSS/JS never touch the app.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function unlock(slug, password) {
  if (!isSupabaseConfigured) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const vk = (() => { try { return viewerKey(window.localStorage); } catch { return 'anon'; } })();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hosted-doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ slug, password, viewerKey: vk }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw Object.assign(new Error(j.error || 'failed'), { code: j.error || 'failed' });
  return j; // { ok, title, html }
}

const readSaved = (slug) => { try { return sessionStorage.getItem(passwordStorageKey(slug)) || ''; } catch { return ''; } };
const writeSaved = (slug, pw) => { try { if (pw) sessionStorage.setItem(passwordStorageKey(slug), pw); else sessionStorage.removeItem(passwordStorageKey(slug)); } catch { /* ignore */ } };

export default function HostedDocPage({ slug }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(() => (readSaved(slug) ? 'resuming' : 'idle')); // idle | resuming | checking | open
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);

  const go = async (pw, { silent = false } = {}) => {
    setStatus(silent ? 'resuming' : 'checking');
    setError('');
    try {
      const d = await unlock(slug, pw);
      writeSaved(slug, pw);
      setDoc(d);
      setStatus('open');
    } catch (e) {
      writeSaved(slug, '');
      setStatus('idle');
      if (!silent) setError(unlockErrorMessage(e?.code));
    }
  };

  // Same-tab reload: re-prove the remembered password (this counts as another open).
  useEffect(() => {
    const saved = readSaved(slug);
    if (saved) go(saved, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (doc?.title) document.title = doc.title;
  }, [doc]);

  if (status === 'open' && doc) {
    return (
      <iframe
        className="hd-frame"
        srcDoc={doc.html}
        title={doc.title || 'Document'}
        allow="fullscreen; autoplay; picture-in-picture"
      />
    );
  }

  const busy = status === 'checking' || status === 'resuming';
  const submit = (e) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    go(password);
  };

  return (
    <div className="hd-page">
      <div className="hd-bg" aria-hidden="true" />
      <div className="hd-card">
        <img className="hd-logo" src="/assets/alloy-logo-full-color.svg" alt="Alloy Growth Partners" />
        <div className="hd-eyebrow">Private document</div>
        <h1>Enter the password to continue</h1>
        <p className="hd-sub">This page was shared with you privately. Use the password from your Alloy contact.</p>
        <form className="hd-form" onSubmit={submit}>
          <div className="hd-field">
            <label htmlFor="hd-password">Password</label>
            <input
              id="hd-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <div className="hd-error" role="alert">{error}</div> : null}
          <button type="submit" className="hd-submit" disabled={busy || !password.trim()}>
            {busy ? 'Opening…' : 'Open document'}
          </button>
        </form>
        <div className="hd-foot">Shared by Alloy Growth Partners · <a href="https://alloygp.co" target="_blank" rel="noreferrer">alloygp.co</a></div>
      </div>
    </div>
  );
}
