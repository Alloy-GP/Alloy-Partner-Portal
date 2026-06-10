import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import ProfilePhoto from './ProfilePhoto.jsx';
import CompanyMark from './CompanyMark.jsx';
import { listSnapshots } from '../lib/admin.js';
import { startPortalTour } from '../lib/tour.js';

// Dashboard screen — warm, celebratory home
function Dashboard({ role, density, onNav, t, mobileNav, setMobileNav }) {
  const tierClass = (DATA.account.tier || "").toLowerCase();
  return (
    <div className="content" data-screen-label="01 Dashboard">
      {/* Celebrate — fresh signed deal */}
      {t.celebrate ? <CelebrateBanner /> : null}

      {/* Primary hero — purple panel with 5-stripe accent + live data points */}
      <AlloyHero onNav={onNav} mobileNav={mobileNav} setMobileNav={setMobileNav} />

      {/* Action queue + Projects + Activity — full width, prominent, directly under banner */}
      <div className="dash-spotlight">
        <ActionQueue onNav={onNav} />
        <ProjectsList onNav={onNav} />
        <PartnershipValueCard onNav={onNav} />
      </div>

      <DashboardFooter />
    </div>
  );
}

function DashboardFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="dash-footer">
      <div className="dash-footer-accent" aria-hidden="true">
        <span/><span/><span/><span/><span/>
      </div>
      <div className="dash-footer-row">
        <div className="dash-footer-brand">
          <img src="/alloy-icon.png" alt="" className="dash-footer-mark"/>
          <div>
            <div className="dash-footer-name">Alloy Growth Partners</div>
            <div className="dash-footer-tag">Engineered growth for community association management.</div>
          </div>
        </div>
        <nav className="dash-footer-links" aria-label="Footer">
          <a href="#">Account</a>
          <a href="#">Settings</a>
          <a href="#">Support</a>
          <a href="#">Privacy</a>
        </nav>
        <div className="dash-footer-meta">
          <span>Partner Portal · v1.0</span>
          <span className="dot" aria-hidden="true">·</span>
          <span>© {year} Alloy GP</span>
        </div>
      </div>
    </footer>
  );
}

// Primary dashboard hero — purple panel, 5-stripe accent, company-name title,
// lead greeting, and a 4-stat metadata row pulling live portal data.
function AlloyHero({ onNav, mobileNav, setMobileNav }) {
  const firstName = (DATA.user.name || "there").split(" ")[0];

  // Current quarter + today's date, live in the viewer's local timezone.
  const _now = new Date();
  const _q = Math.floor(_now.getMonth() / 3) + 1;
  const _today = _now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const qLabel = `Q${_q} ${_now.getFullYear()} • ${_today}`;

  // Items needing attention — open tickets + projects in "review" status
  const openTickets = (DATA.tickets || []).filter(t => t.status !== "answered").length;
  const reviewProjects = (DATA.projects || []).filter(p => p.status === "review" || p.status === "blocked").length;
  const attentionCount = openTickets + reviewProjects;
  const attentionLabel = attentionCount === 0
    ? "All caught up"
    : `${attentionCount} ${attentionCount === 1 ? "item" : "items"} for you`;

  // Goal — set per client in Admin (label + current/target).
  const goalLabel = DATA.account?.goalLabel || "boards signed";
  const goalCurrent = Number(DATA.account?.goalCurrent || 0);
  const goalTarget = Number(DATA.account?.goalTarget || 0);
  const yearPct = goalTarget ? Math.round((goalCurrent / goalTarget) * 100) : 0;

  // Tier / plan
  const plan = `BoardSuite ${DATA.account?.tier || "Accelerate"}`;

  return (
    <section className="alloy-hero" aria-label="Account overview" data-tour="hero">
      <div className="alloy-hero-main">
        <div className="alloy-hero-logo alloy-hero-avatar">
          <ProfilePhoto />
        </div>
        <div className="alloy-hero-content">
          <div className="alloy-hero-top">
            {/* Mobile-only controls — bell + hamburger */}
            <div className="alloy-hero-controls">
              <button className="alloy-hero-icon-btn" aria-label="Notifications">
                <I.Bell width={18} height={18}/>
                <span className="pulse-dot"/>
              </button>
              <button
                className="alloy-hero-icon-btn"
                aria-label={mobileNav ? "Close menu" : "Open menu"}
                onClick={() => setMobileNav && setMobileNav(!mobileNav)}
              >
                {mobileNav
                  ? <I.Close width={20} height={20}/>
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
                }
              </button>
            </div>
          </div>

          <h1 className="alloy-hero-title">Welcome back, {firstName}.</h1>
        </div>
      </div>

      <div className="alloy-hero-footer">
        <button
          className="alloy-hero-cta"
          onClick={() => onNav && onNav("playbook")}
          aria-label="View Roadmap"
        >
          View Roadmap <span className="arr" aria-hidden="true">→</span>
        </button>

        <div className="alloy-hero-stats">
          <div className="alloy-hero-stat">
            <span className="k">Current quarter</span>
            <span className="v">{qLabel}</span>
          </div>
          <div className="alloy-hero-stat">
            <span className="k">Goal</span>
            <span className="v">{goalCurrent} of {goalTarget} {goalLabel}</span>
            <div className="track" aria-hidden="true">
              <div className="track-fill" style={{ width: `${yearPct}%` }}/>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopTopBar({ onNav, title, isDashboard, active, session, onSignOut }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const [userOpen, setUserOpen] = React.useState(false);
  const userRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  React.useEffect(() => {
    if (!userOpen) return;
    const onDoc = (e) => { if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userOpen]);
  const u = DATA.user || {};

  return (
    <div className="desktop-topbar">
      <div className="ds-brand">
        <CompanyMark className="ds-brand-mark" size={42}/>
        <span className="ds-brand-name">{title || DATA.account.shortName || DATA.account.company}</span>
      </div>
      <div className="grow"/>
      <div className="ds-utilities">
        {active === "playbook" ? (
          <div className="ds-util-bar">
            <button className="btn btn-secondary" title="View previous years" aria-label="Previous years">
              <span aria-hidden="true">←</span> Previous years
            </button>
            <button className="btn btn-primary" title="Compare baseline (when you started) to this quarter">
              Baseline → Q2 benchmarks
            </button>
          </div>
        ) : (
          <div className="ds-util-bar">
            <button className="btn btn-primary" onClick={() => onNav("tickets")}>
              <I.Plus width={13} height={13}/> New request
            </button>
          </div>
        )}
        <div className="ds-notif" ref={ref}>
        <button
          className={`ds-icon-btn${open ? " active" : ""}`}
          aria-label="Notifications"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <I.Bell width={17} height={17}/>
          <span className="pulse"/>
        </button>
        {open ? (
          <div className="ds-notif-pop" role="menu">
            <div className="ds-notif-head">
              <span className="ds-notif-title">Notifications</span>
              <span className="ds-notif-badge">1 new</span>
            </div>
            <button className="ds-notif-item" role="menuitem" onClick={() => setOpen(false)}>
              <span className="ds-notif-ic"><I.Doc width={15} height={15}/></span>
              <span className="ds-notif-body">
                <span className="ds-notif-item-title">New monthly snapshot ready to view</span>
                <span className="ds-notif-item-sub">Your snapshot for March is ready.</span>
                <span className="ds-notif-time">Just now · Fri 5:00 PM</span>
              </span>
              <span className="ds-notif-unread" aria-hidden="true"/>
            </button>
            <button className="ds-notif-foot" onClick={() => setOpen(false)}>View all notifications →</button>
          </div>
        ) : null}
        </div>
        <div className="ds-user" ref={userRef}>
          <button className="ds-avatar-btn" aria-label="Account" aria-haspopup="true" aria-expanded={userOpen} onClick={() => setUserOpen(o => !o)}>
            {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : <span>{u.initials || (u.name || "?").slice(0, 2).toUpperCase()}</span>}
          </button>
          {userOpen ? (
            <div className="ds-notif-pop ds-user-pop" role="menu">
              <div className="ds-user-head">
                <div className="ds-user-name">{u.name || "Account"}</div>
                <div className="ds-user-email">{session?.user?.email || DATA.account.company}</div>
              </div>
              <button className="ds-user-signout ds-user-tour" role="menuitem" onClick={() => { setUserOpen(false); startPortalTour({ userId: session?.user?.id }); }}>
                <I.Sparkle width={15} height={15} />
                View portal tour
              </button>
              {onSignOut ? (
                <button className="ds-user-signout" role="menuitem" onClick={onSignOut}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Past weekly snapshots — month calendar; every Friday with a published
// snapshot is a download link. Navigates back through the engagement.
function PastSnapshotCalendar() {
  const latest = new Date(2026, 2, 20);   // most recent snapshot Friday
  const earliest = new Date(2025, 2, 7);  // first Friday of the engagement
  const [view, setView] = React.useState({ y: 2026, m: 2 });

  const first = new Date(view.y, view.m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dow = ["S", "M", "T", "W", "T", "F", "S"];

  const monthIndex = view.y * 12 + view.m;
  const canPrev = monthIndex > earliest.getFullYear() * 12 + earliest.getMonth();
  const canNext = monthIndex < latest.getFullYear() * 12 + latest.getMonth();
  const prev = () => canPrev && setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => canNext && setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = n => String(n).padStart(2, "0");
  const fileFor = d => `reports/weekly-${view.y}-${pad(view.m + 1)}-${pad(d)}.pdf`;
  const titleFor = d => `Download snapshot · week of ${new Date(view.y, view.m, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="ws-cal">
      <div className="ws-cal-head">
        <button className="ws-cal-arrow" onClick={prev} disabled={!canPrev} aria-label="Earlier month">
          <span style={{ transform: "rotate(90deg)", display: "inline-flex" }}><I.Chevron width={14} height={14}/></span>
        </button>
        <span className="ws-cal-title">{monthLabel}</span>
        <button className="ws-cal-arrow" onClick={next} disabled={!canNext} aria-label="Later month">
          <span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}><I.Chevron width={14} height={14}/></span>
        </button>
      </div>
      <div className="ws-cal-grid">
        {dow.map((d, i) => <div key={`d${i}`} className="ws-cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="ws-cal-cell empty"/>;
          const dt = new Date(view.y, view.m, d);
          const isFri = dt.getDay() === 5;
          const hasSnap = isFri && dt >= earliest && dt <= latest;
          if (hasSnap) {
            return (
              <a key={i} className="ws-cal-cell ws-cal-fri" href={fileFor(d)} download title={titleFor(d)}>
                <span className="ws-cal-day">{d}</span>
                <span className="ws-cal-dl"><I.Download width={11} height={11}/></span>
              </a>
            );
          }
          return (
            <div key={i} className={`ws-cal-cell${isFri ? " ws-cal-fri-empty" : ""}`}>
              <span className="ws-cal-day">{d}</span>
            </div>
          );
        })}
      </div>
      <div className="ws-cal-legend">
        <span className="ws-cal-legend-dot"/> Friday snapshot · click to download
      </div>
    </div>
  );
}

function PartnershipValueCard({ onNav }) {
  const leads = DATA.recentLeads || [];
  const quoteMonthly = leads.reduce((s, l) => s + (Number(l.quoteValue) || 0), 0);
  const salesMonthly = leads.reduce((s, l) => s + (Number(l.salesValue) || 0), 0);
  const lifetimeQualified = DATA.account?.wcQualifiedTotal || leads.filter(l => l.quotable === "yes").length;
  // Management fee -> true contract revenue (mid of the 2.25-2.5 range).
  const CONTRACT = 2.375;
  const fmtBig = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
    if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return `$${Math.round(n)}`;
  };

  // Quarterly playbook progress (kept above the value tiles).
  const pb = (DATA.roadmap || []).find(q => q.state === "now") || (DATA.roadmap || [])[0] || {};
  const allProjects = DATA.projects || [];
  const pbTotal = allProjects.length;
  const pbDone = allProjects.filter(p => p.status === "live").length;
  const pbPct = pbTotal ? Math.round((pbDone / pbTotal) * 100) : 0;

  // All-time relationship value (not a period). The $ tiles are driven by the
  // quote/sales values entered in the qualify flow, so they grow as leads get
  // valued.
  const tiles = [
    { num: lifetimeQualified.toLocaleString("en-US"), lbl: "Qualified leads", sub: "since day one", color: "var(--alloy-purple)" },
    { num: fmtBig(quoteMonthly * 12 * CONTRACT), lbl: "Total quote value", sub: "contract revenue", color: "#2f6fb0" },
    { num: fmtBig(salesMonthly * CONTRACT * 60), lbl: "Revenue created", sub: "lifetime, closed", color: "#2c8a6e" },
    { num: fmtBig(salesMonthly * 12 * CONTRACT * 4), lbl: "Projected firm value", sub: "your firm", color: "var(--alloy-pink)" },
  ];

  return (
    <div className="ws-column" data-tour="snapshot">
      <button className="ws-playbook" onClick={() => onNav && onNav("playbook")}>
        <div className="ws-pb-head">
          <span className="ws-pb-label">{pb.q || "Roadmap"} Playbook</span>
          <span className="ws-pb-link">View playbook →</span>
        </div>
        <div className="ws-pb-metric">
          <span className="ws-pb-pct">{pbPct}<span className="ws-pb-pct-sym">%</span></span>
          <span className="ws-pb-sub">{pbDone} of {pbTotal} tasks complete</span>
        </div>
        <div className="ws-pb-track">
          <div className="ws-pb-fill" style={{ width: `${pbPct}%` }}/>
        </div>
      </button>

      <div className="weekly-snapshot">
        <div className="ws-head">
          <div className="ws-head-row">
            <span className="ws-title">Partnership value</span>
          </div>
          <div className="ws-head-meta">
            <span className="ws-kicker">What we've built together</span>
          </div>
        </div>
        <div className="pv-grid">
          {tiles.map((t) => (
            <div key={t.lbl} className="pv-tile">
              <span className="pv-num" style={{ color: t.color }}>{t.num}</span>
              <span className="pv-lbl">{t.lbl}</span>
              <span className="pv-sub">{t.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CelebrateBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;
  return (
    <div className="notif-celebrate notif-payment" role="alert">
      <svg className="notif-decor" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="95" cy="30" r="40" fill="none" stroke="#fff" strokeWidth="3"/>
        <circle cx="95" cy="30" r="20" fill="none" stroke="#f5d880" strokeWidth="3"/>
      </svg>
      <div className="notif-icon">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="#f5d880" strokeWidth="1.5"/>
          <path d="M2 7h12M5 11h2" stroke="#f5d880" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="notif-text">
        <div className="notif-kicker">Action required</div>
        <div className="notif-title">Payment method needed</div>
      </div>
      <button className="notif-cta">Update</button>
      <button className="notif-close" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        <I.Close width={10} height={10}/>
      </button>
    </div>
  );
}

function KpiCard({ k }) {
  const iconMap = { trophy: <I.Trophy width={15} height={15}/>, phone: <I.Phone width={15} height={15}/>, trend: <I.TrendUp width={15} height={15}/>, star: <I.Star width={15} height={15}/> };
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span className={`stat-icon stat-icon-${k.tone}`}>{iconMap[k.icon]}</span>
        {k.label}
      </div>
      <div className="stat-value">{k.value}</div>
      <div className={`stat-trend ${k.up ? "" : "down"}`}>
        <I.TrendUp width={13} height={13} /> {k.trend} <span className="vs">vs last period</span>
      </div>
      <Sparkline tone={k.tone} />
    </div>
  );
}

function Sparkline({ tone = "pink" }) {
  const colors = { pink: "#d9356e", yellow: "#b8881a", blue: "#2a6391", green: "#2c6e62" };
  const c = colors[tone] || "#d9356e";
  const path = "M0 22 L8 18 L16 20 L24 14 L32 16 L40 10 L48 12 L56 6 L64 8";
  return (
    <svg className="spark" width="76" height="28" viewBox="0 0 76 28" fill="none">
      <path d={path} stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      <circle cx="64" cy="8" r="3" fill={c} />
    </svg>
  );
}

// Action queue — only items waiting on the client (review + blocked)
function ActionQueue({ onNav }) {
  const needsYou = (DATA.actionQueue || []).slice(0, 8);
  // Needs triage = not yet qualified ("yes") and not marked "not a fit" ("no").
  const pendingLeads = (DATA.recentLeads || []).filter(l => l.quotable !== "yes" && l.quotable !== "no").length;
  return (
    <div className="banner-card banner-yellow dash-feature-card hdr-icon" data-tour="queue">
      <div className="banner-card-head">
        <div className="hdr-ic"><I.Bolt width={18} height={18}/></div>
        <div className="bc-titles">
          <div className="bc-kicker">Waiting on your team</div>
          <div className="bc-title">Your action queue</div>
        </div>
        <button className="bc-cta bc-cta-pink" onClick={() => onNav("tickets")} aria-label="View all tickets">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
      <div className="banner-card-body">
      {pendingLeads > 0 ? (
        <button className="rise-hero-nudge aq-nudge aq-nudge-top" onClick={() => onNav("leads")}>
          <span className="rise-hero-nudge-badge">{pendingLeads}</span>
          <span className="rise-hero-nudge-body">
            <span className="rise-hero-nudge-title">Qualify {pendingLeads} pending {pendingLeads === 1 ? "lead" : "leads"}</span>
            <span className="rise-hero-nudge-sub">Each one keeps your pipeline live</span>
          </span>
          <span className="rise-hero-nudge-chev" aria-hidden="true">→</span>
        </button>
      ) : null}
      {needsYou.length === 0 ? (
        <div style={{marginTop: pendingLeads > 0 ? 14 : 0, padding:"14px 16px", background:"var(--alloy-purple-tint)", borderRadius:8, fontSize:12.5, color:"var(--alloy-purple)", display:"flex", alignItems:"center", gap:8}}>
          <I.Sparkle width={16} height={16}/> Everything else is on track. We'll surface it here when it needs you.
        </div>
      ) : (
        <div className="aq-scroll" style={{display:"flex", flexDirection:"column", gap:10}}>
          {needsYou.map((p, i) => (
            <button key={i} className="aq-item" onClick={() => onNav("tickets", p.routeId)}>
              <div className="aq-item-body">
                <div className="aq-item-title">{p.title}</div>
                <div className="aq-item-sub">{p.dueRel}</div>
              </div>
              <span className="aq-item-chev" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

// "Work in motion" — a value lens on the work Alloy is driving for the client
// (NOT a to-do list; anything needing the client lives in the action queue).
// Shows breadth + delivered proof + always-on services, so it scales past 50
// projects and reads as value at a glance instead of a truncated list.
function ProjectsList({ onNav }) {
  const all = DATA.projects || [];
  const inMotion = all.filter(p => p.status !== "live");
  // "Delivered this quarter" — live projects whose due date lands in the current
  // calendar quarter (due_date is the best delivery signal we sync).
  const _now = new Date();
  const _qStart = new Date(_now.getFullYear(), Math.floor(_now.getMonth() / 3) * 3, 1);
  const _qEnd = new Date(_qStart.getFullYear(), _qStart.getMonth() + 3, 1);
  const inQuarter = (d) => { if (!d) return false; const x = new Date(d); return x >= _qStart && x < _qEnd; };
  const deliveredQtr = all.filter(p => p.status === "live" && inQuarter(p.dueDate)).length;
  const services = DATA.recurringServices || [];
  const [showRecurring, setShowRecurring] = React.useState(false);
  const TONE = {
    pink: "var(--alloy-pink)", yellow: "var(--alloy-yellow)", purple: "var(--alloy-purple)",
    blue: "#2a6391", green: "var(--alloy-green)",
  };
  const PCOLORS = ["#d9356e", "#2a6391", "#2c6e62", "#381c4f", "#b8881a", "#9b6dc4", "#c2703d", "#5a7d9a"];
  // Breadth by category: show plenty of areas (fills the card, reads as value),
  // fold only the long tail into "+N more". Skip projects with no category set.
  const TOP = 8;
  const byPhase = Object.entries(
    all.filter(p => p.phase).reduce((m, p) => { m[p.phase] = (m[p.phase] || 0) + 1; return m; }, {})
  ).sort((a, b) => b[1] - a[1]);
  const topPhases = byPhase.slice(0, TOP);
  const moreCats = byPhase.length - topPhases.length;
  const moreCount = byPhase.slice(TOP).reduce((s, [, n]) => s + n, 0);

  return (
    <div className="banner-card banner-yellow active-projects-front dash-feature-card hdr-icon" data-tour="projects">
      <div className="banner-card-head">
        <div className="hdr-ic"><I.Folder width={20} height={20}/></div>
        <div className="bc-titles">
          <div className="bc-kicker">What we're driving</div>
          <div className="bc-title">Work in motion</div>
        </div>
        <button className="bc-cta" onClick={() => onNav("projects")} aria-label="See all projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
      <div className="banner-card-body">
        <div className="wm-stats">
          <span className="big">{inMotion.length}</span>
          <span className="lbl">in motion now</span>
          <span className="wm-div" aria-hidden="true" />
          <span className="big green">{deliveredQtr}</span>
          <span className="lbl muted">delivered this qtr</span>
        </div>

        {topPhases.length ? (
          <div className="wm-pills">
            {topPhases.map(([name, n], i) => (
              <span key={name} className="wm-pill" style={{ "--c": PCOLORS[i % PCOLORS.length] }}>
                <span className="wm-live" />{name}<span className="n">{n}</span>
              </span>
            ))}
            {moreCats > 0 ? (
              <span className="wm-pill rest">
                <span className="dot" />{moreCats} more {moreCats === 1 ? "area" : "areas"}<span className="n">{moreCount}</span>
              </span>
            ) : null}
          </div>
        ) : null}

        <button className="recurring-toggle" onClick={() => setShowRecurring(s => !s)} aria-expanded={showRecurring} style={{ marginTop: 14 }}>
          <span className="recurring-toggle-dots">
            {services.slice(0, 5).map(s => (<span key={s.id} className="recurring-toggle-dot" style={{ background: TONE[s.color] }}/>))}
          </span>
          <span className="recurring-toggle-label">
            <strong>{services.length} always-on services</strong>
            <span className="recurring-toggle-sub">running in the background</span>
          </span>
          <span className={`recurring-toggle-chev ${showRecurring ? "open" : ""}`}><I.Arrow width={14} height={14}/></span>
        </button>
        {showRecurring ? (
          <div className="recurring-panel">
            {services.map(s => (
              <div key={s.id} className="recurring-row">
                <span className="recurring-dot" style={{ background: TONE[s.color] }}/>
                <div className="recurring-name" title={s.name}>{s.name}</div>
                <span className="recurring-cadence">{s.cadence}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecentLeads() {
  // Two states only: qualified, or needs triage
  const qualityMap = {
    qualified: { label: "Qualified", cls: "tag-status-live" },
    hot:       { label: "Qualified", cls: "tag-status-live" },
    review:    { label: "Pending",   cls: "tag-status-progress" },
  };
  const allLeads = DATA.recentLeads || [];
  const pendingCount = allLeads.filter(l => l.quality === "review").length;
  const qualifiedCount = allLeads.length - pendingCount;
  return (
    <div className="banner-card banner-yellow">
      <div className="banner-card-head">
        <div className="bc-titles">
          <div className="bc-kicker">WhatConverts · live</div>
          <div className="bc-title">Leads</div>
        </div>
        <button className="bc-cta">All leads →</button>
      </div>
      <div className="leads-stats">
        <div className="leads-stat">
          <div className="leads-stat-num" style={{color:"#2c6e62"}}>{qualifiedCount}</div>
          <div className="leads-stat-lbl">qualified</div>
        </div>
        <div className="leads-stat">
          <div className="leads-stat-num" style={{color:"#b8881a"}}>{pendingCount}</div>
          <div className="leads-stat-lbl">pending</div>
        </div>
      </div>
      <div className="banner-card-body">
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          {DATA.recentLeads.slice(0, 4).map((l, i) => {
            const q = qualityMap[l.quality];
            return (
              <div key={i} style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"14px 16px", background:"var(--alloy-off-white)",
                border:"1px solid var(--border-subtle)", borderRadius:10,
              }}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:700, color:"var(--alloy-purple)", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{l.name}</div>
                  <div style={{fontSize:12, color:"var(--fg-muted)"}}>{l.source} · {l.time}</div>
                </div>
                <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
                  <span style={{fontSize:13, fontWeight:800, color: l.quality === "review" ? "var(--fg-muted)" : "var(--alloy-purple)", fontFamily:"var(--font-display)"}}>{l.quality === "review" ? "TBD" : l.value}</span>
                  <span className={`tag ${q.cls}`}><span className="dot"/>{q.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const colorMap = {
    pink: { bg: "var(--alloy-pink-tint)", fg: "var(--alloy-pink)", icon: <I.Trophy width={14} height={14}/> },
    yellow: { bg: "var(--alloy-yellow-tint)", fg: "#b8881a", icon: <I.Phone width={14} height={14}/> },
    blue: { bg: "var(--alloy-blue-tint)", fg: "#2a6391", icon: <I.Send width={14} height={14}/> },
    green: { bg: "var(--alloy-green-tint)", fg: "#2c6e62", icon: <I.Star width={14} height={14}/> },
    purple: { bg: "var(--alloy-purple-tint)", fg: "var(--alloy-purple)", icon: <I.Sparkle width={14} height={14}/> },
  };
  return (
    <div className="card card-pad">
      <div className="card-head">
        <span className="kicker">This week</span>
        <h3>Activity</h3>
      </div>
      <div className="activity-list">
        {DATA.activity.map((a, i) => {
          const c = colorMap[a.color];
          return (
            <div key={i} className="activity-item">
              <div className="ic" style={{background: c.bg, color: c.fg}}>{c.icon}</div>
              <div className="body">
                <div className="head-line">{a.text}</div>
                <div className="meta">{a.meta}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketSnapshot({ onNav }) {
  const open = DATA.tickets.filter(t => t.status !== "answered").slice(0, 3);
  return (
    <div className="card card-pad">
      <div className="card-head">
        <span className="kicker">Zendesk · your queue</span>
        <h3>Open requests</h3>
        <div className="grow" />
        <a onClick={() => onNav("tickets")} style={{cursor:"pointer"}}>Inbox →</a>
      </div>
      <div className="ticket-list" style={{margin: "0 -8px"}}>
        {open.map(t => <TicketRow key={t.id} t={t} compact />)}
      </div>
      <button className="btn btn-secondary" style={{marginTop: 16, width: "100%", justifyContent:"center"}} onClick={() => onNav("tickets")}>
        <I.Plus width={13} height={13}/> Send a request to your Alloy team
      </button>
    </div>
  );
}

function TicketRow({ t, compact, onClick, active }) {
  const priorityCls = `priority-${t.priority === "high" ? "high" : t.priority === "med" ? "med" : "low"}`;
  const statusMap = {
    open: { label: "Awaiting Alloy", cls: "tag-status-progress" },
    "in-progress": { label: "In progress", cls: "tag-status-live" },
    answered: { label: "Answered", cls: "tag-status-done" },
  };
  const s = statusMap[t.status];
  return (
    <div className={`ticket-item ${priorityCls} ${active?"active":""}`} onClick={onClick}>
      <div className="priority-bar"/>
      <div>
        <div className="title-line">{t.title}</div>
        <div className="meta-line"><span className="id">{t.id}</span><span className="sep"/>{t.agent}<span className="sep"/>{t.time}</div>
      </div>
      <span className={`tag ${s.cls}`}>{s.label}</span>
      <span className="tag tag-outline" style={{textTransform:"uppercase"}}>{t.priority}</span>
      <I.Arrow width={14} height={14} />
    </div>
  );
}

function RecognitionSnapshot({ onNav }) {
  const earned = DATA.badges.filter(b => b.state === "earned").length;
  const total = DATA.badges.length;
  const next = DATA.badges.find(b => b.state === "progress");
  const toNext = next ? Math.max(1, Math.ceil((100 - next.pct) / 10)) : 0;
  return (
    <div className="recognition-tiles-card">
      <div className="rt-head">
        <div>
          <div className="rt-kicker">Recognition</div>
          <div className="rt-title">Your wins this year</div>
        </div>
        <a onClick={() => onNav("rewards")} className="rt-link">All badges →</a>
      </div>
      <div className="rt-grid">
        <div className="rt-tile">
          <div className="rt-num" style={{color:"var(--alloy-pink)"}}>{earned}<span className="rt-num-sub">/{total}</span></div>
          <div className="rt-lbl">badges earned</div>
        </div>
        <div className="rt-tile">
          <div className="rt-num" style={{color:"var(--alloy-yellow)"}}>{toNext}</div>
          <div className="rt-lbl">to next medal</div>
        </div>
        <div className="rt-tile">
          <div className="rt-num" style={{color:"#fff"}}>Top<span className="rt-num-sub" style={{marginLeft:6}}>5%</span></div>
          <div className="rt-lbl">of Alloy clients</div>
        </div>
        <div className="rt-tile">
          <div className="rt-num" style={{color:"var(--alloy-green)"}}>14</div>
          <div className="rt-lbl">day streak</div>
        </div>
      </div>
      {next ? (
        <button className="rt-next" onClick={() => onNav("rewards")}>
          <BadgeMedalSmall color="var(--alloy-pink)" state="progress"/>
          <div className="rt-next-body">
            <div className="rt-next-kicker">Up next · {next.pct}%</div>
            <div className="rt-next-name">{next.name}</div>
          </div>
          <span className="rt-next-arrow">→</span>
        </button>
      ) : null}
    </div>
  );
}

function ScoreRing({ pct, value, total }) {
  const r = 36; const c = 2*Math.PI*r;
  const off = c - (pct/100)*c;
  return (
    <div className="score-ring">
      <svg viewBox="0 0 88 88" width="88" height="88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--alloy-light-gray)" strokeWidth="8"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--alloy-pink)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 44 44)"/>
      </svg>
      <div className="center"><div><div className="v">{value}<span style={{fontSize:13, color:"var(--fg-muted)", fontWeight:600}}>/{total}</span></div><div className="t">earned</div></div></div>
    </div>
  );
}

function MiniBadge({ b }) {
  const colors = { pink: "#d9356e", yellow: "#f5d880", blue: "#a1c8e7", green: "#aed7d0", purple: "#381c4f" };
  const fg = colors[b.color];
  return (
    <div style={{textAlign:"center", padding:"10px 6px", border:"1px solid var(--border-subtle)", borderRadius: 10, opacity: b.state==="locked"?0.4:1}}>
      <BadgeMedalSmall color={fg} state={b.state}/>
      <div style={{fontSize: 10.5, fontWeight: 700, color:"var(--alloy-purple)", marginTop:6, lineHeight:1.2}}>{b.name}</div>
    </div>
  );
}

function BadgeMedalSmall({ color = "#d9356e", state = "earned" }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{margin:"0 auto", display:"block"}}>
      <defs>
        <linearGradient id={`mg-${color}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color}/>
          <stop offset="100%" stopColor="#381c4f"/>
        </linearGradient>
      </defs>
      <polygon points="22,4 28,8 35,7 37,14 42,18 39,25 40,32 33,34 30,40 22,38 14,40 11,34 4,32 5,25 2,18 7,14 9,7 16,8" fill={state==="locked"?"#e8e4ef":`url(#mg-${color})`} stroke={state==="locked"?"#c9c1d6":"#fff"} strokeWidth="1.2"/>
      <circle cx="22" cy="22" r="9" fill="#fff" opacity="0.15"/>
      {state==="locked" ? <g><rect x="18" y="20" width="8" height="7" rx="1.4" fill="#fff"/><path d="M19 20v-2a3 3 0 0 1 6 0v2" fill="none" stroke="#fff" strokeWidth="1.4"/></g> : <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="var(--font-display)">★</text>}
    </svg>
  );
}


export { Dashboard, DesktopTopBar, TicketRow, MiniBadge, BadgeMedalSmall, ScoreRing };
