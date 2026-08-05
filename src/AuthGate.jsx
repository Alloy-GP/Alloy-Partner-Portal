import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/useAuth.js';
import { supabase } from './lib/supabase.js';
import { getMe, loadAccountData } from './lib/loadData.js';
import { applyData } from './data.js';
import { track } from './lib/track.js';
import Login from './components/Login.jsx';
import NoAccess from './components/NoAccess.jsx';
import AdminShell from './components/AdminShell.jsx';
import { BoardProposalPage } from './components/board-proposal.jsx';
import QuarterGoalsForm from './components/quarter-goals.jsx';
import App from './App.jsx';

let loginLogged = false; // once per page load

/**
 * Auth + routing:
 *   - not configured → App (mock mode)
 *   - no session → Login
 *   - no profile → NoAccess
 *   - staff with no client selected → Alloy Home (portfolio)
 *   - client (or staff viewing a client) → App scoped to that account
 *
 * The staff-selected client lives in the URL (/c/:accountId/...), so it's
 * refresh-stable and shareable. Loaded account data is cached per account, so
 * coming back to a client is instant (no reload, no flash).
 */
function AuthGate() {
  const { configured, loading, session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState(undefined);          // undefined = loading, null = no access
  const [loadedAccountId, setLoadedAccountId] = useState(null); // which account DATA holds
  const [, setTick] = useState(0);                   // bump to re-render after a live refresh
  const cacheRef = useRef(new Map());                // accountId → loaded DATA snapshot

  // Staff client selection is the /c/:id URL segment.
  const urlParts = location.pathname.split('/').filter(Boolean);
  const urlClientId = urlParts[0] === 'c' && urlParts[1] ? urlParts[1] : null;

  // Who am I — staff or a client (and which account)?
  useEffect(() => {
    if (!configured || !session) return;
    let cancelled = false;
    setMe(undefined);
    getMe(session).then((m) => { if (!cancelled) setMe(m); })
      .catch(() => { if (!cancelled) setMe(null); });
    return () => { cancelled = true; };
  }, [configured, session]);

  // Which account to show: a client's own, or the staff member's URL selection.
  const viewAccountId = me ? (me.isStaff ? urlClientId : me.accountId) : null;

  // If we already have this account cached, apply it BEFORE paint so revisiting
  // a client is instant — no loader frame, no flash.
  useLayoutEffect(() => {
    if (!viewAccountId) return;
    const cached = cacheRef.current.get(viewAccountId);
    if (cached) { applyData(cached); setLoadedAccountId(viewAccountId); }
  }, [viewAccountId]);

  // Fetch fresh data (always — keeps the cache current), then apply + cache.
  useEffect(() => {
    if (!configured || !session || !me || !viewAccountId) return;
    let cancelled = false;
    loadAccountData(session, viewAccountId, me)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          cacheRef.current.set(viewAccountId, data);
          applyData(data);
          if (!loginLogged) { loginLogged = true; track('login'); }
        }
        setLoadedAccountId(viewAccountId);
        setTick((t) => t + 1);
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
          if (d) { cacheRef.current.set(viewAccountId, d); applyData(d); setTick((t) => t + 1); }
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

  // Public, shell-less board proposal page — the magic-link destination the HOA
  // board opens. No portal shell, no auth (the future anonymous board surface).
  const boardMatch = location.pathname.match(/\/proposals\/board\/([^/?#]+)/);
  if (boardMatch) return <BoardProposalPage id={decodeURIComponent(boardMatch[1])} />;

  // Public, shell-less pre-planning goals form — a shareable link (no auth) for
  // clients to submit next quarter's goals. Runs even in mock mode.
  if (/^\/goals\/?$/.test(location.pathname)) return <QuarterGoalsForm />;

  if (!configured) return <App />;
  if (loading) return splash;
  if (!session) return <Login />;
  if (me === undefined) return splash;
  if (me === null) return <NoAccess email={session.user?.email} onSignOut={signOut} />;

  // Staff surfaces that live above any single client — the whole Admin
  // dashboard (Overview, Portfolio, Newsletter Room, Monthly Updates, …). One
  // shell, sidebar sections routed under /admin/* (and bare "/" = Overview).
  if (me.isStaff && !urlClientId) {
    return <AdminShell onSignOut={signOut} />;
  }

  // Only render the portal once DATA actually holds the account we're viewing —
  // never flash the previous client's dashboard while the new one loads.
  if (loadedAccountId !== viewAccountId) return appLoader;

  const staffNav = me.isStaff
    ? { onHome: () => navigate('/admin/portfolio'), onAdmin: () => navigate('/admin') }
    : null;
  return <App session={session} onSignOut={signOut} staffNav={staffNav} />;
}

export default AuthGate;
