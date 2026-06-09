import React, { useEffect, useState } from 'react';
import { useAuth } from './lib/useAuth.js';
import { loadAccountData } from './lib/loadData.js';
import { applyData } from './data.js';
import Login from './components/Login.jsx';
import NoAccess from './components/NoAccess.jsx';
import App from './App.jsx';

/**
 * Decides what to render based on auth + data state:
 *   - Supabase not configured → App directly (mock mode, no gate, no fetch).
 *   - Loading the initial session → splash.
 *   - Configured + no session → the magic-link Login screen.
 *   - Configured + session → fetch the account's data into DATA, then App.
 */
function AuthGate() {
  const { configured, loading, session, signOut } = useAuth();
  // In mock mode there's nothing to fetch, so data is "ready" immediately.
  const [dataReady, setDataReady] = useState(!configured);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    if (!configured || !session) return;
    let cancelled = false;
    setDataReady(false);
    setHasAccess(true);
    loadAccountData(session)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setHasAccess(false);     // signed in, but no account membership
        } else {
          applyData(data);
        }
        setDataReady(true);
      })
      .catch(() => {
        // Fetch failed (network, etc.) — fall back to whatever DATA holds.
        if (!cancelled) setDataReady(true);
      });
    return () => { cancelled = true; };
  }, [configured, session]);

  if (!configured) return <App />;

  if (loading || (session && !dataReady)) {
    return (
      <div className="login-page">
        <div className="login-bg" aria-hidden="true" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (!hasAccess) {
    return <NoAccess email={session.user?.email} onSignOut={signOut} />;
  }

  return <App session={session} onSignOut={signOut} />;
}

export default AuthGate;
