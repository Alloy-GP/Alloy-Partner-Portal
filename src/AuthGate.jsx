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
  const [dataReady, setDataReady] = useState(!configured);
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
    setDataReady(false);
    loadAccountData(session, viewAccountId, me)
      .then((data) => {
        if (cancelled) return;
        if (data) { applyData(data); if (!loginLogged) { loginLogged = true; track('login'); } }
        setDataReady(true);
      })
      .catch(() => { if (!cancelled) setDataReady(true); });
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

  const splash = (
    <div className="login-page"><div className="login-bg" aria-hidden="true" /></div>
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

  if (!dataReady) return splash;

  const staffNav = me.isStaff ? { onHome: () => setActiveAccountId(null) } : null;
  return <App session={session} onSignOut={signOut} staffNav={staffNav} />;
}

export default AuthGate;
