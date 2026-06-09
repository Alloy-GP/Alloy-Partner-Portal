import React, { useEffect, useState } from 'react';
import { useAuth } from './lib/useAuth.js';
import { supabase } from './lib/supabase.js';
import { loadAccountData } from './lib/loadData.js';
import { applyData } from './data.js';
import { track } from './lib/track.js';

let loginLogged = false; // once per page load
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
  const [, setTick] = useState(0); // bump to re-render after a live refresh

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
          if (!loginLogged) { loginLogged = true; track('login'); }
        }
        setDataReady(true);
      })
      .catch(() => {
        // Fetch failed (network, etc.) — fall back to whatever DATA holds.
        if (!cancelled) setDataReady(true);
      });
    return () => { cancelled = true; };
  }, [configured, session]);

  // Live updates: when the Monday sync writes to a synced table, refetch and
  // re-render so the open portal updates without a manual reload. RLS scopes
  // the realtime events to this user's account. Debounced because the sync
  // does a delete-all-then-insert (a burst of events) per run.
  useEffect(() => {
    if (!configured || !session) return;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const data = await loadAccountData(session);
          if (data) { applyData(data); setTick((t) => t + 1); }
        } catch { /* ignore transient */ }
      }, 600);
    };
    const channel = supabase
      .channel('portal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_services' }, refresh)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
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
