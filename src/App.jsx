import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from './components/icons.jsx';
import { DATA } from './data.js';
import { Sidebar, RisePageHero } from './components/shell.jsx';
import { Dashboard, DesktopTopBar } from './components/screen-dashboard.jsx';
import { ProjectsScreen, ROIScreen } from './components/screens-projects-roi.jsx';
import { TicketsScreen, LibraryScreen, RecognitionScreen, LeadsScreen } from './components/screens-rest.jsx';
import RoadmapScreen from './components/screen-roadmap.jsx';
import TicketDetailPage from './components/TicketDetailPage.jsx';
import SnapshotScreen from './components/SnapshotScreen.jsx';
import PerformanceScreen from './components/PerformanceScreen.jsx';
import AccountScreen from './components/AccountScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { track } from './lib/track.js';
import { startPortalTour } from './lib/tour.js';
import { can } from './lib/perms.js';
import NewRequestModal from './components/NewRequestModal.jsx';

// Screen id ↔ URL path. The screen switch keys off the id derived from the URL.
const PATHS = {
  dashboard: '/', leads: '/leads', snapshot: '/snapshot', roi: '/roi', projects: '/projects', tickets: '/tickets',
  performance: '/performance',
  playbook: '/playbook', library: '/library', rewards: '/rewards', 'account-details': '/account',
};

// App entry — composes Sidebar + screen
const { useState, useEffect } = React;
const TWEAKS = /*EDITMODE-BEGIN*/{
  "celebrate": false,
  "density": "comfortable",
  "showBg": true,
  "mobileCards": "card"
}/*EDITMODE-END*/;

function App({ session, onSignOut, staffNav } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  // A staff member viewing a client carries the client in the URL: /c/:id/...
  // Screens are parsed from the path *after* that optional prefix.
  const parts = location.pathname.split('/').filter(Boolean);
  const clientPrefix = parts[0] === 'c' && parts[1] ? `/c/${parts[1]}` : '';
  const rest = clientPrefix ? parts.slice(2) : parts;
  const seg = '/' + (rest[0] || '');
  const active = Object.keys(PATHS).find((id) => PATHS[id] === seg) || 'dashboard';
  const ticketId = active === 'tickets' ? (rest[1] || null) : null;
  // Real permission level from the signed-in profile (admin | staff | owner |
  // accounting). `can()` reads this + isStaff against the capability matrix.
  const [role, setRole] = useState(() => (DATA.user && DATA.user.role) || "owner");
  const canNewRequest = can(DATA.user, "newRequest");
  const [editMode, setEditMode] = useState(false);
  const [tweaks, setTweaks] = useState(TWEAKS);
  const [mobileNav, setMobileNav] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  // Sidebar control: expanded | collapsed | hover (expand on hover).
  const [sidebarMode, setSidebarMode] = useState(() => {
    try { return localStorage.getItem("alloy_sidebar_mode") || "expanded"; } catch { return "expanded"; }
  });
  const [sidebarHover, setSidebarHover] = useState(false);
  const chooseMode = (m) => {
    setSidebarMode(m); setSidebarHover(false);
    try { localStorage.setItem("alloy_sidebar_mode", m); } catch {}
  };
  // Collapsed footprint when explicitly collapsed, or in hover mode while not hovering.
  const sidebarCollapsed = sidebarMode === "collapsed" || (sidebarMode === "hover" && !sidebarHover);

  const setTweak = (key, val) => {
    let next;
    if (typeof key === "object") next = { ...tweaks, ...key };
    else next = { ...tweaks, [key]: val };
    setTweaks(next);
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: next }, "*"); } catch (e) {}
  };

  useEffect(() => {
    const handler = (e) => {
      if (!e.data || !e.data.type) return;
      if (e.data.type === "__activate_edit_mode") setEditMode(true);
      if (e.data.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", handler);
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (e) {}
    return () => window.removeEventListener("message", handler);
  }, []);

  // Log a screen view on each navigation (feeds admin analytics).
  useEffect(() => { track("view", { screen: active }); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // First-run guided tour — clients only, once. Waits a beat so the dashboard
  // anchors are mounted; the tour stamps profiles.tour_completed_at on finish.
  const tourStartedRef = React.useRef(false);
  useEffect(() => {
    if (tourStartedRef.current || active !== "dashboard") return;
    const u = DATA.user || {};
    if (!u.id || u.isStaff || u.tourCompletedAt) return;
    tourStartedRef.current = true;
    const t = setTimeout(() => startPortalTour({ userId: u.id }), 800);
    return () => clearTimeout(t);
  }, [active, DATA.user && DATA.user.id, DATA.user && DATA.user.tourCompletedAt]);

  const titles = {
    dashboard: { t: "Dashboard", s: "Tuesday, March 17 — your week at a glance" },
    leads: { t: "Pipeline", s: "Qualify every lead — it flows straight to WhatConverts" },
    snapshot: { t: "Monthly snapshot", s: "Your month with Alloy, every month-end" },
    performance: { t: "Visibility", s: "How your growth engine is performing" },
    roi: { t: "ROI & Insight", s: "What Alloy is doing for your top line" },
    projects: { t: "Quarterly Playbook", s: "Live from Monday — every active deliverable" },
    tickets: { t: "Inbox", s: "One thread between you and your Alloy team" },
    playbook: { t: "Roadmap", s: "Every market's journey across the five growth stages" },
    library: { t: "Resource library", s: "Plays, guides and courses for your team" },
    rewards: { t: "Recognition", s: "Wins, made tangible" },
    'account-details': { t: "Account Details", s: "Your plan, team, and account settings" },
  };

  // Navigate within the current client context. `sub` appends a sub-path
  // (e.g. a ticket id) so deep links keep the /c/:id prefix.
  const handleNav = (id, sub) => {
    const base = PATHS[id] || '/';
    const path = clientPrefix + (base === '/' ? '' : base) + (sub ? `/${sub}` : '');
    navigate(path || '/');
    setMobileNav(false); window.scrollTo(0, 0);
  };
  const handleCommand = (cmd) => { if (cmd === "new-ticket") setComposeOpen(true); };

  const screen = (() => {
    if (active === "tickets" && ticketId) return <TicketDetailPage id={ticketId} onNav={handleNav}/>;
    switch (active) {
      case "dashboard": return <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks} mobileNav={mobileNav} setMobileNav={setMobileNav}/>;
      case "roi": return <ROIScreen/>;
      case "projects": return <ProjectsScreen onNav={handleNav} onCompose={canNewRequest ? () => setComposeOpen(true) : null}/>;
      case "tickets": return <TicketsScreen/>;
      case "leads": return <LeadsScreen/>;
      case "playbook": return <RoadmapScreen onNav={handleNav}/>;
      case "library": return <LibraryScreen/>;
      case "rewards": return <RecognitionScreen/>;
      case "snapshot": return <SnapshotScreen/>;
      case "performance": return <PerformanceScreen onNav={handleNav}/>;
      case "account-details": return <AccountScreen onNav={handleNav} onCompose={canNewRequest ? () => setComposeOpen(true) : null}/>;
      default: return <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks}/>;
    }
  })();

  return (
    <>
    <div className={`app density-${tweaks.density}${sidebarCollapsed ? " sidebar-collapsed" : ""}${sidebarMode === "hover" ? " sidebar-hover" : ""}${sidebarMode === "hover" && sidebarHover ? " is-hovering" : ""}`} data-bg={tweaks.showBg ? "on" : "off"}>
      {/* Mobile top bar — brand + hamburger that opens the sidebar drawer. Hidden ≥961px. */}
      <div className="mobile-bar">
        <div className="brand"><img className="mark" src="/alloy-icon.png" alt=""/>{DATA.account.shortName || DATA.account.company}</div>
        <button className="mobile-bar-menu" aria-label={mobileNav ? "Close menu" : "Open menu"} onClick={() => setMobileNav(!mobileNav)}>
          {mobileNav
            ? <I.Close width={22} height={22}/>
            : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>}
        </button>
      </div>

      {/* Sidebar (responsive) */}
      <div className={`sidebar-wrap ${mobileNav ? "open" : ""}`}>
        <Sidebar active={active} onNav={handleNav} role={role} onRole={setRole} tier={DATA.account.tier} density={tweaks.density} t={tweaks} setTweak={setTweak} collapsed={sidebarCollapsed} session={session} onSignOut={onSignOut} staffNav={staffNav} sidebarMode={sidebarMode} onSetMode={chooseMode}
          onHoverChange={(h) => { if (sidebarMode === "hover") setSidebarHover(h); }} />
        <div className="sidebar-scrim" onClick={() => setMobileNav(false)}/>
      </div>

      <main className="main">
        <DesktopTopBar title={active === "dashboard" ? (DATA.account.shortName || DATA.account.company) : titles[active].t} isDashboard={active === "dashboard"} active={active} onNav={handleNav} session={session} onSignOut={onSignOut} onNewRequest={canNewRequest ? () => setComposeOpen(true) : null}/>
        {active !== "dashboard" ? <RisePageHero title={titles[active].t} subtitle={titles[active].s} mobileNav={mobileNav} setMobileNav={setMobileNav}/> : null}
        <ErrorBoundary key={location.pathname}>{screen}</ErrorBoundary>
      </main>

      {editMode ? <TweaksFloat tweaks={tweaks} setTweak={setTweak} onClose={() => {
        setEditMode(false);
        try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch (e) {}
      }}/> : null}

      {/* In-page tweaks toggle — visible on mobile where the toolbar toggle isn't */}
      {!editMode ? (
        <button className="tweaks-fab" onClick={() => setEditMode(true)} aria-label="Open tweaks">
          <I.Settings width={18} height={18}/>
        </button>
      ) : null}

      {composeOpen ? (
        <NewRequestModal
          onClose={() => setComposeOpen(false)}
          onCreated={(id) => { setComposeOpen(false); handleNav('tickets', id); }}
        />
      ) : null}
    </div>
    </>
  );
}

function TweaksFloat({ tweaks, setTweak, onClose }) {
  return (
    <div className="tweaks-float">
      <div className="head">
        <span className="dot"/>
        <div style={{flex:1}}>Tweaks</div>
        <button className="tweaks-close" onClick={onClose} aria-label="Close tweaks"><I.Close width={12} height={12}/></button>
      </div>
      <div className="body">
        <div className="row">
          <label>Celebrate banner</label>
          <button className={`toggle ${tweaks.celebrate?"on":""}`} onClick={() => setTweak("celebrate", !tweaks.celebrate)}><span className="thumb"/></button>
        </div>
        <div className="row">
          <label>Background ornaments</label>
          <button className={`toggle ${tweaks.showBg?"on":""}`} onClick={() => setTweak("showBg", !tweaks.showBg)}><span className="thumb"/></button>
        </div>
        <div className="row col">
          <label>Density</label>
          <div className="seg">
            {["comfortable","compact"].map(d => (
              <button key={d} className={tweaks.density===d?"active":""} onClick={() => setTweak("density", d)}>{d}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


export default App;
