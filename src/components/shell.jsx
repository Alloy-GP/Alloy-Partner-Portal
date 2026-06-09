import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import CompanyMark from './CompanyMark.jsx';
import { zdList } from '../lib/zendesk.js';

// Shell — sidebar nav, header, role switcher
const { useState, useEffect, useRef, useMemo } = React;

function Sidebar({ active, onNav, role, onRole, tier, density, t, setTweak, collapsed, onToggleCollapse, session, onSignOut }) {
  const isStaff = !!(DATA.user && DATA.user.isStaff);

  // Projects badge: active (non-live) projects. Tickets badge: the client's
  // open tasks = pending Zendesk tickets (matches the "{client} Tasks" bucket).
  const openProjects = (DATA.projects || []).filter((p) => p.status && p.status !== 'live').length;
  const [pendingTickets, setPendingTickets] = useState(null);
  useEffect(() => {
    let cancelled = false;
    zdList()
      .then((res) => {
        if (cancelled || !res) return;
        setPendingTickets((res.tickets || []).filter((t) => t.status === 'pending').length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [DATA.account?.id]); // refetch when switching client

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: I.Home, group: "growth" },
    { id: "snapshot", label: "Weekly snapshot", icon: I.Calendar, group: "growth" },
    { id: "playbook", label: "Roadmap", icon: I.Map, group: "growth" },
    { id: "projects", label: "Projects", icon: I.Folder, group: "growth", count: openProjects },
    { id: "tickets", label: "Tickets", icon: I.Ticket, group: "account", count: pendingTickets || 0 },
    { id: "account-details", label: "Account Details", icon: I.Settings, group: "account" },
    { id: "assets", label: "Assets", icon: I.Doc, group: "account", external: true, href: "https://dam.alloygp.co" },
    // Admin lives at the staff level (Alloy Home), not inside a client's sidebar.
  ].filter(n => !n.staff || isStaff);
  const grouped = {
    top: navItems.filter(n => n.group === "top"),
    growth: navItems.filter(n => n.group === "growth"),
    account: navItems.filter(n => n.group === "account"),
  };
  return (
    <aside className="sidebar">
      <div className="alloy-strip">
        <img className="alloy-mark" src="/alloy-icon.png" alt="Alloy"/>
        <span className="alloy-word">Alloy</span>
        <span className="alloy-divider"/>
        <span className="alloy-tag">Partner Portal</span>
      </div>
      <button className="alloy-strip-spacer" aria-hidden="true" style={{display:"none"}}/>

      <nav className="sidebar-nav">
        {grouped.top.map(it => (
          <div key={it.id} className="nav-item" data-active={active === it.id} onClick={() => onNav(it.id)}>
            <span className="icon"><it.icon /></span>
            <span>{it.label}</span>
            {it.count ? <span className="badge-dot">{it.count}</span> : null}
          </div>
        ))}
        <div className="nav-section-label">Growth</div>
        {grouped.growth.map(it => (
          <div
            key={it.id}
            className={`nav-item${it.soon ? " nav-item-soon" : ""}`}
            data-active={active === it.id}
            onClick={() => { if (!it.soon) onNav(it.id); }}
            aria-disabled={it.soon ? true : undefined}
          >
            <span className="icon"><it.icon /></span>
            <span>{it.label}</span>
            {it.soon ? <span className="nav-soon-tag">Soon</span> : (it.count ? <span className="badge-dot">{it.count}</span> : null)}
          </div>
        ))}
        <div className="nav-section-label has-divider">Account</div>
        {grouped.account.map(it => (
          it.external ? (
            <a
              key={it.id}
              className="nav-item nav-item-external"
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="icon"><it.icon /></span>
              <span>{it.label}</span>
              <span className="nav-ext-icon" aria-hidden="true"><I.External width={13} height={13}/></span>
            </a>
          ) : (
            <div
              key={it.id}
              className={`nav-item${it.soon ? " nav-item-soon" : ""}`}
              data-active={active === it.id}
              onClick={() => { if (!it.soon) onNav(it.id); }}
              aria-disabled={it.soon ? true : undefined}
            >
              <span className="icon"><it.icon /></span>
              <span>{it.label}</span>
              {it.soon ? <span className="nav-soon-tag">Soon</span> : (it.count ? <span className="badge-dot">{it.count}</span> : null)}
            </div>
          )
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-row">
          <div className="avatar">{DATA.user.initials}</div>
          <div className="who">
            <div className="nm">{DATA.user.name}</div>
            <div className="role">{session?.user?.email || DATA.account.company}</div>
          </div>
          {onSignOut ? (
            <button className="icon-btn" style={{color: "rgba(255,255,255,0.6)"}} onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          ) : (
            <button className="icon-btn" style={{color: "rgba(255,255,255,0.6)"}}><I.Settings width={16} height={16}/></button>
          )}
        </div>
      </div>
    </aside>
  );
}

function MainHeader({ title, subtitle, onCommand, screen }) {
  return (
    <div className="main-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <span className="sub">{subtitle}</span> : null}
      </div>
      <div className="grow" />
      <div className="search">
        <I.Search width={15} height={15} />
        <input placeholder="Search projects, tickets, resources…" />
        <kbd>⌘K</kbd>
      </div>
      <button className="icon-btn"><I.Bell width={18} height={18}/><span className="pulse"/></button>
      <button className="btn btn-primary btn-sm" onClick={() => onCommand("new-ticket")}>
        <I.Plus width={13} height={13}/> New request
      </button>
    </div>
  );
}

function RisePageHero({ title, subtitle, mobileNav, setMobileNav }) {
  const co = DATA.account.shortName || DATA.account.company;
  return (
    <div className="rise-hero rise-hero-tinted rise-page-hero">
      <div className="rise-hero-body">
        <div className="rise-hero-topline">
          <div className="rise-hero-mobile-controls">
            <button className="rise-hero-icon-btn" aria-label="Notifications">
              <I.Bell width={20} height={20}/>
              <span className="rise-hero-dot"/>
            </button>
            <button
              className="rise-hero-icon-btn rise-hero-menu-btn"
              aria-label={mobileNav ? "Close menu" : "Open menu"}
              onClick={() => setMobileNav && setMobileNav(!mobileNav)}
            >
              {mobileNav
                ? <I.Close width={24} height={24}/>
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
              }
            </button>
          </div>
        </div>
        <div className="rise-page-headline">
          <span className="rise-hero-mark-chip rise-page-mark-chip">
            <CompanyMark className="rise-hero-mark-img" size={40}/>
          </span>
          <div className="rise-page-headline-text">
            <span className="rise-page-eyebrow">{co}</span>
            <h1 className="rise-page-title">{title}</h1>
          </div>
        </div>
        {subtitle ? <p className="rise-page-sub">{subtitle}</p> : null}
      </div>
    </div>
  );
}


export { Sidebar, MainHeader, RisePageHero };
