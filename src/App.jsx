import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from './components/icons.jsx';
import { DATA } from './data.js';
import { Sidebar, RisePageHero } from './components/shell.jsx';
import { Dashboard, DesktopTopBar } from './components/screen-dashboard.jsx';
import { ProjectsScreen, ROIScreen } from './components/screens-projects-roi.jsx';
import { TicketsScreen, PlaybookScreen, LibraryScreen, RecognitionScreen } from './components/screens-rest.jsx';
import TicketDetailPage from './components/TicketDetailPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { track } from './lib/track.js';

// Screen id ↔ URL path. The screen switch keys off the id derived from the URL.
const PATHS = {
  dashboard: '/', roi: '/roi', projects: '/projects', tickets: '/tickets',
  playbook: '/playbook', library: '/library', rewards: '/rewards',
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
  const [role, setRole] = useState("owner");
  const [editMode, setEditMode] = useState(false);
  const [tweaks, setTweaks] = useState(TWEAKS);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("alloy_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem("alloy_sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

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

  const titles = {
    dashboard: { t: "Dashboard", s: "Tuesday, March 17 — your week at a glance" },
    roi: { t: "ROI & Insight", s: "What Alloy is doing for your top line" },
    projects: { t: "Projects", s: "Live from Monday — every deliverable in motion" },
    tickets: { t: "Tickets", s: "One thread between you and your Alloy team" },
    playbook: { t: "Roadmap", s: "Your 2026 growth plan, quarter by quarter" },
    library: { t: "Resource library", s: "Plays, guides and courses for your team" },
    rewards: { t: "Recognition", s: "Wins, made tangible" },
  };

  // Navigate within the current client context. `sub` appends a sub-path
  // (e.g. a ticket id) so deep links keep the /c/:id prefix.
  const handleNav = (id, sub) => {
    const base = PATHS[id] || '/';
    const path = clientPrefix + (base === '/' ? '' : base) + (sub ? `/${sub}` : '');
    navigate(path || '/');
    setMobileNav(false); window.scrollTo(0, 0);
  };
  const handleCommand = (cmd) => { if (cmd === "new-ticket") handleNav('tickets'); };

  const screen = (() => {
    if (active === "tickets" && ticketId) return <TicketDetailPage id={ticketId} onNav={handleNav}/>;
    switch (active) {
      case "dashboard": return <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks} mobileNav={mobileNav} setMobileNav={setMobileNav}/>;
      case "roi": return <ROIScreen/>;
      case "projects": return <ProjectsScreen onNav={handleNav}/>;
      case "tickets": return <TicketsScreen/>;
      case "playbook": return <PlaybookScreen onNav={handleNav}/>;
      case "library": return <LibraryScreen/>;
      case "rewards": return <RecognitionScreen/>;
      default: return <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks}/>;
    }
  })();

  return (
    <>
    {staffNav ? (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "var(--alloy-purple-deep)", color: "#fff", fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ opacity: 0.7 }}>Alloy admin</span>
        <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
        <span>Viewing <strong>{DATA.account?.shortName || DATA.account?.company}</strong></span>
        <button onClick={staffNav.onHome} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.14)", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700 }}>
          ⌂ All clients
        </button>
      </div>
    ) : null}
    <div className={`app density-${tweaks.density} mobile-cards-${tweaks.mobileCards || "card"}${sidebarCollapsed ? " sidebar-collapsed" : ""}`} data-bg={tweaks.showBg ? "on" : "off"}>
      {/* Mobile top bar — removed; mobile controls now live inside the hero card */}

      {/* Sidebar (responsive) */}
      <div className={`sidebar-wrap ${mobileNav ? "open" : ""}`}>
        <Sidebar active={active} onNav={handleNav} role={role} onRole={setRole} tier={DATA.account.tier} density={tweaks.density} t={tweaks} setTweak={setTweak} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} session={session} onSignOut={onSignOut} />
        <button className={`sidebar-collapse-btn${sidebarCollapsed ? " is-collapsed" : ""}`} onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand" : "Collapse"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="sidebar-scrim" onClick={() => setMobileNav(false)}/>
      </div>

      <main className="main">
        <DesktopTopBar title={active === "dashboard" ? (DATA.account.shortName || DATA.account.company) : titles[active].t} isDashboard={active === "dashboard"} active={active} onNav={handleNav}/>
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
        <div className="row col">
          <label>Mobile cards</label>
          <div className="seg">
            {[{k:"card", lbl:"Card"}, {k:"section", lbl:"Section"}].map(o => (
              <button key={o.k} className={(tweaks.mobileCards||"card")===o.k?"active":""} onClick={() => setTweak("mobileCards", o.k)}>{o.lbl}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


export default App;
