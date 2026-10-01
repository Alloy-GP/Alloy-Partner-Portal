import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from './components/icons.jsx';
import { DATA } from './data.js';
import { Sidebar } from './components/shell.jsx';
import CompanyMark from './components/CompanyMark.jsx';
import { Dashboard, DesktopTopBar } from './components/screen-dashboard.jsx';
import { ProjectsScreen, ROIScreen } from './components/screens-projects-roi.jsx';
import { TicketsScreen, LibraryScreen, RecognitionScreen, LeadsScreen } from './components/screens-rest.jsx';
import RoadmapScreen from './components/screen-roadmap.jsx';
import TicketDetailPage from './components/TicketDetailPage.jsx';
import SnapshotScreen from './components/SnapshotScreen.jsx';
import PerformanceScreen from './components/PerformanceScreen.jsx';
import AccountScreen from './components/AccountScreen.jsx';
import { AssetsScreen } from './components/screen-assets.jsx';
import ProposalsScreen from './components/screen-proposals.jsx';
import PrivacyScreen from './components/PrivacyScreen.jsx';
import OnboardingScreen from './components/OnboardingScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { track } from './lib/track.js';
import { startPortalTour, TOUR_REVISED_AT } from './lib/tour.js';
import { can, effectiveIdentity } from './lib/perms.js';
import { canSeeProposals } from './lib/proposalAccess.js';
import ProposalPage from './components/proposal/ProposalPage.jsx';
import { proposalGateState } from './lib/engagementGate.js';
import { canSeeOnboarding } from './lib/onboarding.js';
import NewRequestModal from './components/NewRequestModal.jsx';
import NewsletterModal from './components/NewsletterModal.jsx';
import QuarterGoalsModal from './components/QuarterGoalsModal.jsx';
import PaymentSetupModal from './components/PaymentSetupModal.jsx';
import PaymentNudgeBanner from './components/PaymentNudgeBanner.jsx';
import { shouldNudgePayment, isNudgeSnoozed, snoozeNudge } from './lib/paymentNudge.js';
import { isSupabaseConfigured } from './lib/supabase.js';

// Screen id ↔ URL path. The screen switch keys off the id derived from the URL.
// NOTE: the KEYS are historical screen-ids (kept stable so analytics + onNav
// calls don't churn); the VALUES are the user-facing URLs, which match the nav
// labels and page titles. id "playbook" = the Roadmap page, id "projects" = the
// Playbook page, id "leads" = the Partnership page, id "performance" = Visibility.
const PATHS = {
  dashboard: '/', leads: '/partnership', snapshot: '/snapshot', roi: '/roi', projects: '/playbook', tickets: '/tickets',
  performance: '/visibility',
  playbook: '/roadmap', library: '/library', rewards: '/rewards', 'account-details': '/account', privacy: '/privacy',
  assets: '/assets', proposals: '/proposals', onboarding: '/onboarding',
};

// App entry — composes Sidebar + screen
const { useState, useEffect } = React;
const TWEAKS = /*EDITMODE-BEGIN*/{
  "celebrate": false,
  "density": "comfortable",
  "showBg": true,
  "mobileCards": "card"
}/*EDITMODE-END*/;

// Autopay nudge: auto-open at most once per PAGE LOAD (module scope, so an
// App remount from an auth refresh can't re-fire it or double-count the event).
let pmAutoOpenedThisLoad = false;

function App({ session, onSignOut, staffNav } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  // "View as client" — staff QA. Drops the staff override so the app renders
  // exactly what a CLIENT of this account sees (proposals hidden unless the
  // account's flag is on, staff nav gone, etc.). Account ACCESS is unaffected —
  // AuthGate uses the real `me.isStaff`; only in-app gating flips. `staffNav` is
  // the REAL staff flag (truthy only for staff), so the exit toggle never hides.
  const realStaff = !!staffNav;
  const viewAsClient = realStaff && new URLSearchParams(location.search).get('as') === 'client';
  if (DATA.user) {
    // Effective identity — children read DATA.user synchronously this render.
    // Preview = the client's OWNER (see effectiveIdentity); real role remembered.
    if (DATA.user.realRole === undefined) DATA.user.realRole = DATA.user.role;
    const eff = effectiveIdentity(DATA.user, { realStaff, viewAsClient });
    DATA.user.isStaff = eff.isStaff; DATA.user.role = eff.role;
  }
  const toggleViewAsClient = () => {
    const sp = new URLSearchParams(location.search);
    if (viewAsClient) sp.delete('as'); else sp.set('as', 'client');
    const qs = sp.toString();
    navigate(`${location.pathname}${qs ? '?' + qs : ''}`);
  };
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
  // Newsletter intake — the account's current OPEN round surfaces as an item in
  // the Action Queue (dashboard) + "Waiting on you" (Playbook), NOT a banner.
  // `openNewsletter` is the trigger those surfaces call; null when nothing's due.
  const nlReq = (DATA.newsletterRequest && DATA.newsletterRequest.status === 'open') ? DATA.newsletterRequest : null;
  const [nlModalOpen, setNlModalOpen] = useState(false);
  // Each "Open Form" click logs a newsletter_open event (client-only; track()
  // skips staff) → powers the admin "opened by / clicks" analytics.
  const openNewsletter = nlReq ? () => { track('newsletter_open', { requestId: nlReq.id }); setNlModalOpen(true); } : null;
  // Quarterly-goals intake — surfaces on any `goals`-tagged ticket (no round
  // gating), opens the prefilled in-portal form. Each open logs a goals_open.
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const openGoals = () => { track('goals_open', {}); setGoalsModalOpen(true); };
  // Autopay onboarding — SOFT nudge. A billing-role client with no bank on
  // file gets the setup modal at sign-in ("Remind me later" snoozes it for the
  // session) plus a persistent banner on every screen, until a bank is on
  // file. The decision is pure (src/lib/paymentNudge.js); mock mode never nudges.
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [, setPmTick] = useState(0);   // re-render once a bank is saved (DATA is mutable)
  // Engagement proposal gate — a NEW client whose proposal is 'sent' sees ONLY
  // the proposal page until their owner accepts (src/lib/engagementGate.js).
  // Staff are never locked; "View as client" is (that is how staff QA it).
  // While locked, the autopay nudge and the first-run tour stay quiet — they
  // are the NEXT steps and fire naturally once the portal opens.
  const [, setGateTick] = useState(0);
  const gateState = proposalGateState({ user: DATA.user, engagement: DATA.engagement });
  const locked = gateState === 'locked';
  const pmNudge = !locked && isSupabaseConfigured && shouldNudgePayment({ user: DATA.user, account: DATA.account, paymentMethod: DATA.paymentMethod });
  // While an OPEN onboarding checklist carries the bank step (its nav badge +
  // dashboard card already point there), the sign-in modal and the persistent
  // banner stand down — one nudge, not three. The Account page empty state and
  // the checklist row still open the modal. Resumes once staff mark it complete.
  const pmViaOnboarding = pmNudge && onboardingOwnsPaymentNudge(DATA.onboarding) && canSeeOnboarding(DATA.user, DATA.account, DATA.onboarding);
  const pmNudgeUi = pmNudge && !pmViaOnboarding;
  // Staff previewing a client see the nudge but must not log client events.
  const trackNudge = (type) => { if (!viewAsClient) track(type, {}); };
  const openPm = () => { trackNudge('payment_nudge_open'); setPmModalOpen(true); };
  const autoOpenPm = () => {
    if (pmAutoOpenedThisLoad || isNudgeSnoozed()) return;
    pmAutoOpenedThisLoad = true;
    trackNudge('payment_nudge_shown');
    setPmModalOpen(true);
  };
  // Mobile top bar hides on scroll-down, returns on scroll-up.
  const [barHidden, setBarHidden] = useState(false);
  // Sidebar control: expanded | collapsed | hover (expand on hover).
  const [sidebarMode, setSidebarMode] = useState(() => {
    try { return localStorage.getItem("alloy_sidebar_mode") || "hover"; } catch { return "hover"; }
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

  // Mobile top bar: hide on scroll-down (past a small threshold), reveal on
  // scroll-up. Keep it visible while the nav drawer is open or near the top.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (mobileNav || y < 12) setBarHidden(false);
      else if (y > lastY + 4 && y > 56) setBarHidden(true);
      else if (y < lastY - 4) setBarHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobileNav]);

  // First-run guided tour — clients only, once. Waits a beat so the dashboard
  // anchors are mounted; the tour stamps profiles.tour_completed_at on finish.
  const tourStartedRef = React.useRef(false);
  useEffect(() => {
    if (tourStartedRef.current || active !== "dashboard" || locked) return;
    const u = DATA.user || {};
    // Show on first sign-in (no completion) OR when the tour was revised after
    // their last completion ("something new"). Otherwise leave them alone.
    const seenCurrent = u.tourCompletedAt && Date.parse(u.tourCompletedAt) >= Date.parse(TOUR_REVISED_AT);
    if (!u.id || u.isStaff || seenCurrent) return;
    tourStartedRef.current = true;
    const t = setTimeout(() => startPortalTour({ userId: u.id, onDone: () => { if (pmNudgeUi) autoOpenPm(); } }), 800);
    return () => clearTimeout(t);
  }, [active, DATA.user && DATA.user.id, DATA.user && DATA.user.tourCompletedAt, locked]);

  // Auto-open the autopay modal at sign-in — unless the first-run tour is about
  // to play on the dashboard (it opens the nudge when it finishes instead).
  useEffect(() => {
    if (!pmNudgeUi) return;
    const u = DATA.user || {};
    const tourDue = !!u.id && !u.isStaff && !(u.tourCompletedAt && Date.parse(u.tourCompletedAt) >= Date.parse(TOUR_REVISED_AT));
    if (tourDue && active === 'dashboard') return;
    const t = setTimeout(autoOpenPm, 400);
    return () => clearTimeout(t);
  }, [pmNudgeUi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Locked → the proposal is the whole portal. Accepting flips DATA in place
  // (the row is already 'accepted' server-side) and re-renders into the real
  // portal, where the autopay nudge / tour take over.
  if (locked) {
    return (
      <ProposalPage
        onSignOut={onSignOut}
        previewOnly={realStaff}
        onExitPreview={toggleViewAsClient}
        onAccepted={() => { if (DATA.engagement) DATA.engagement.status = 'accepted'; setGateTick((t) => t + 1); }}
      />
    );
  }

  const titles = {
    dashboard: { t: "Dashboard", s: "Tuesday, March 17 — your week at a glance" },
    leads: { t: "Partnership", s: "Qualify every lead — it flows straight to WhatConverts" },
    snapshot: { t: "Monthly snapshot", s: "Your month with Alloy, every month-end" },
    performance: { t: "Visibility", s: "How your growth engine is performing" },
    roi: { t: "ROI & Insight", s: "What Alloy is doing for your top line" },
    projects: { t: "Playbook", s: "Live from Monday — every active deliverable" },
    tickets: { t: "Inbox", s: "One thread between you and your Alloy team" },
    playbook: { t: "Roadmap", s: "Every market's journey across the five growth stages" },
    library: { t: "Resource library", s: "Plays, guides and courses for your team" },
    rewards: { t: "Recognition", s: "Wins, made tangible" },
    'account-details': { t: "Account Details", s: "Your plan, team, and account settings" },
    assets: { t: "Assets", s: `Everything Alloy has made for ${DATA.account.company}` },
    proposals: { t: "Proposals", s: "Intake, match, and send tailored proposals" },
    privacy: { t: "Privacy", s: "How your information is handled" },
    onboarding: { t: "Onboarding", s: "Everything we need to get your growth engine running" },
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
    if (active === "tickets" && ticketId) return <TicketDetailPage id={ticketId} onNav={handleNav} onNewsletter={openNewsletter} onGoals={openGoals}/>;
    switch (active) {
      case "dashboard": return <Dashboard role={role} density={tweaks.density} onNav={handleNav} onCompose={canNewRequest ? () => setComposeOpen(true) : null} t={tweaks} mobileNav={mobileNav} setMobileNav={setMobileNav}/>;
      case "roi": return <ROIScreen/>;
      case "projects": return <ProjectsScreen onNav={handleNav} onCompose={canNewRequest ? () => setComposeOpen(true) : null} onNewsletter={openNewsletter} onGoals={openGoals}/>;
      case "tickets": return <TicketsScreen onNewsletter={openNewsletter} onGoals={openGoals}/>;
      case "leads": return <LeadsScreen/>;
      case "playbook": return <RoadmapScreen onNav={handleNav}/>;
      case "library": return <LibraryScreen/>;
      case "rewards": return <RecognitionScreen/>;
      case "snapshot": return <SnapshotScreen/>;
      case "performance": return <PerformanceScreen onNav={handleNav}/>;
      case "account-details": return <AccountScreen onNav={handleNav} onCompose={canNewRequest ? () => setComposeOpen(true) : null} onAddPayment={pmNudge ? openPm : null}/>;
      case "assets": return <AssetsScreen/>;
      // Proposals is a CMGT-only pilot: Alloy staff on any account, and among
      // clients only CMGT. Gating the ROUTE (not just the nav) so a direct URL
      // can't reach it either — see src/lib/proposalAccess.js for the matrix.
      case "proposals": return canSeeProposals(DATA.user, DATA.account)
        ? <ProposalsScreen/>
        : <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks}/>;
      // Onboarding checklist — only once Alloy has started one for this account
      // (and never for accounting users: it holds credentials). Same helper
      // gates the nav entry, so a typed URL can't reach what the nav hides.
      case "onboarding": return canSeeOnboarding(DATA.user, DATA.account, DATA.onboarding)
        ? <OnboardingScreen onNav={handleNav} onAddPayment={pmNudge ? openPm : null}/>
        : <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks}/>;
      case "privacy": return <PrivacyScreen/>;
      default: return <Dashboard role={role} density={tweaks.density} onNav={handleNav} t={tweaks}/>;
    }
  })();

  return (
    <>
    {viewAsClient && (
      <div role="button" onClick={toggleViewAsClient} title="Click to exit client view"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, background: 'var(--alloy-purple, #2b2c6c)', color: '#fff', textAlign: 'center', padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        👁 Viewing as a client — staff tools hidden. {DATA.account?.shortName ? `(${DATA.account.shortName})` : ''} &nbsp;·&nbsp; Click to exit
      </div>
    )}
    <div className={`app density-${tweaks.density}${sidebarCollapsed ? " sidebar-collapsed" : ""}${sidebarMode === "hover" ? " sidebar-hover" : ""}${sidebarMode === "hover" && sidebarHover ? " is-hovering" : ""}`} data-bg={tweaks.showBg ? "on" : "off"} style={viewAsClient ? { paddingTop: 30 } : undefined}>
      {/* Mobile top bar — brand + hamburger that opens the sidebar drawer. Hidden ≥961px. */}
      <div className={`mobile-bar${barHidden ? " hidden" : ""}`}>
        <div className="brand" role="button" tabIndex={0} aria-label="Go to dashboard"
          onClick={() => handleNav("dashboard")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNav("dashboard"); } }}>
          <CompanyMark className="mb-mark" size={30} />
          {active === "dashboard"
            ? (DATA.account.shortName || DATA.account.company)
            : ((titles[active] && titles[active].t) || DATA.account.shortName || DATA.account.company)}
        </div>
        <button className="mobile-bar-menu" aria-label={mobileNav ? "Close menu" : "Open menu"} onClick={() => setMobileNav(!mobileNav)}>
          {mobileNav
            ? <I.Close width={22} height={22}/>
            : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>}
        </button>
      </div>

      {/* Sidebar (responsive) */}
      <div className={`sidebar-wrap ${mobileNav ? "open" : ""}`}>
        <Sidebar active={active} onNav={handleNav} role={role} onRole={setRole} tier={DATA.account.tier} density={tweaks.density} t={tweaks} setTweak={setTweak} collapsed={sidebarCollapsed} session={session} onSignOut={onSignOut} staffNav={staffNav} viewAsClient={viewAsClient} onToggleViewAsClient={toggleViewAsClient} sidebarMode={sidebarMode} onSetMode={chooseMode}
          onHoverChange={(h) => { if (sidebarMode === "hover") setSidebarHover(h); }} />
        <div className="sidebar-scrim" onClick={() => setMobileNav(false)}/>
      </div>

      <main className="main">
        <DesktopTopBar title={active === "dashboard" ? (DATA.account.shortName || DATA.account.company) : titles[active].t} isDashboard={active === "dashboard"} active={active} onNav={handleNav} session={session} onSignOut={onSignOut} onNewRequest={canNewRequest ? () => setComposeOpen(true) : null}/>
        {pmNudgeUi ? <PaymentNudgeBanner onOpen={openPm} /> : null}
        {realStaff && !viewAsClient && DATA.engagement && DATA.engagement.status === 'sent' ? (
          <div className="eg-staff-banner" role="status" data-testid="eg-staff-banner">
            <span><strong>Proposal sent (v{DATA.engagement.version}).</strong> This client's portal is locked to the proposal until their owner accepts.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleViewAsClient}>Preview as client</button>
          </div>
        ) : null}
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
          onNav={(screen) => { setComposeOpen(false); handleNav(screen); }}
        />
      ) : null}

      {nlModalOpen && nlReq ? (
        <NewsletterModal
          request={nlReq}
          onClose={() => setNlModalOpen(false)}
          onSubmitted={(ticketId) => { setNlModalOpen(false); if (ticketId) handleNav('tickets', ticketId); }}
        />
      ) : null}

      {goalsModalOpen ? (
        <QuarterGoalsModal onClose={() => setGoalsModalOpen(false)} />
      ) : null}

      {pmModalOpen ? (
        <PaymentSetupModal
          onLater={() => { snoozeNudge(); setPmModalOpen(false); }}
          onSaved={(m) => {
            // Same shape loadData builds from quickbooks_payment_methods, so the
            // banner clears and the Account card fills in without a reload.
            DATA.paymentMethod = { bankName: m.bankName || null, accountType: m.accountType || null, last4: m.last4 || null, status: m.verificationStatus || null, authorizedAt: m.authorizedAt || new Date().toISOString() };
            // …and the onboarding checklist's bank step, if there is one.
            markOnboardingPaymentComplete().catch(() => {}).then(() => setPmTick((t) => t + 1));
            setPmTick((t) => t + 1);
          }}
          onFinish={() => setPmModalOpen(false)}
          previewOnly={realStaff}
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
