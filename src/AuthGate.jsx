import React, { useEffect, useState } from 'react';
import { useAuth } from './lib/useAuth.js';
import { supabase } from './lib/supabase.js';
import { getMe, loadAccountData } from './lib/loadData.js';
import { applyData } from './data.js';
import { track } from './lib/track.js';
import Login from './components/Login.jsx';
import NoAccess from './components/NoAccess.jsx';
import AlloyHome from './components/AlloyHome.jsx';
import App from './App.jsx';

let loginLogged = false; // once per page load

/**
 * Auth + routing:
 *   - not configured → App (mock mode)
 *   - no session → Login
 *   - no profile → NoAccess
 *   - staff with no client selected → Alloy Home (portfolio)
 *   - client (or staff viewing a client) → App scoped to that account
 */
function AuthGate() {
  const { configured, loading, session, signOut } = useAuth();
  const [me, setMe] = useState(undefined);          // undefined = loading, null = no access
  const [activeAccountId, setActiveAccountId] = useState(null); // staff: client being viewed
  const [loadedAccountId, setLoadedAccountId] = useState(null); // which account DATA holds
  const [, setTick] = useState(0);                   // bump to re-render after a live refresh

  // Who am I — staff or a client (and which account)?
  useEffect(() => {
    if (!configured || !session) return;
    let cancelled = false;
    setMe(undefined); setActiveAccountId(null);
    getMe(session).then((m) => { if (!cancelled) setMe(m); })
      .catch(() => { if (!cancelled) setMe(null); });
    return () => { cancelled = true; };
  }, [configured, session]);

  // Which account to load: a client's own, or the staff member's selection.
  const viewAccountId = me ? (me.isStaff ? activeAccountId : me.accountId) : null;

  useEffect(() => {
    if (!configured || !session || !me || !viewAccountId) return;
    let cancelled = false;
    loadAccountData(session, viewAccountId, me)
      .then((data) => {
        if (cancelled) return;
        if (data) { applyData(data); if (!loginLogged) { loginLogged = true; track('login'); } }
        setLoadedAccountId(viewAccountId);
      })
      // Even on failure, advance so we don't hang on the loader — the dashboard
      // guards/ErrorBoundary handle missing data gracefully.
      .catch(() => { if (!cancelled) setLoadedAccountId(viewAccountId); });
    return () => { cancelled = true; };
  }, [configured, session, me, viewAccountId]);

  // Live updates while viewing a client (RLS scopes events to that account).
  useEffect(() => {
    if (!configured || !session || !viewAccountId) return;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const d = await loadAccountData(session, viewAccountId, me);
          if (d) { applyData(d); setTick((t) => t + 1); }
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
  }, [configured, session, viewAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Purple auth splash — only for the pre-session phase.
  const splash = (
    <div className="login-page"><div className="login-bg" aria-hidden="true" /></div>
  );
  // Calm, in-app loader for switching accounts (matches the portal chrome, so
  // entering a client from the portfolio doesn't flash the purple auth screen).
  const appLoader = (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--alloy-off-white)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <img src="/alloy-icon.png" alt="" style={{ width: 34, height: 34, borderRadius: 8, opacity: 0.9 }} />
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>Loading…</div>
      </div>
    </div>
  );

  if (!configured) return <App />;
  if (loading) return splash;
  if (!session) return <Login />;
  if (me === undefined) return splash;
  if (me === null) return <NoAccess email={session.user?.email} onSignOut={signOut} />;

  // Staff land on the portfolio until they enter a client.
  if (me.isStaff && !activeAccountId) {
    return <AlloyHome onEnter={(id) => setActiveAccountId(id)} onSignOut={signOut} />;
  }

  // Only render the portal once DATA actually holds the account we're viewing —
  // never flash the previous client's dashboard while the new one loads.
  if (loadedAccountId !== viewAccountId) return appLoader;

  const staffNav = me.isStaff ? { onHome: () => setActiveAccountId(null) } : null;
  return <App session={session} onSignOut={signOut} staffNav={staffNav} />;
}

export default AuthGate;
