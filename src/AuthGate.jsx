import React, { useEffect, useState } from 'react';
import { useAuth } from './lib/useAuth.js';
import { loadAccountData } from './lib/loadData.js';
import { applyData } from './data.js';
import Login from './components/Login.jsx';
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
  const [dataError, setDataError] = useState(null);

  useEffect(() => {
    if (!configured || !session) return;
    let cancelled = false;
    setDataReady(false);
    setDataError(null);
    loadAccountData(session)
      .then((data) => {
        if (cancelled) return;
        applyData(data);
        setDataReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err);
        setDataReady(true);
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

  return <App session={session} onSignOut={signOut} dataError={dataError} />;
}

export default AuthGate;
