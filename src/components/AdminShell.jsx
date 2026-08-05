import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { I } from './icons.jsx';
import { PortfolioGrid, SnapshotQueue } from './AlloyHome.jsx';
import AdminScreen from './AdminScreen.jsx';
import AdminAnalytics from './AdminAnalytics.jsx';
import AdminNewsletter from './AdminNewsletter.jsx';
import AdminGuides from './AdminGuides.jsx';
import SyncHealth from './SyncHealth.jsx';
import { getPortfolio, snapshotQueue, listNewsletterRequests, listAccounts, listInvites } from '../lib/admin.js';

const { useState, useEffect } = React;

// ── Admin dashboard shell ───────────────────────────────────────────────────
// One chrome for everything staff manage: the Alloy sidebar (admin sections) +
// a header + a scrolling section. Sections are URL routes under /admin/*.
// Reuses the portal's own sidebar/card CSS so it matches the client portal.

const NAV = [
  { group: null, items: [{ id: 'overview', label: 'Dashboard', icon: I.Home, path: '/admin' }] },
  { group: 'Clients', items: [
    { id: 'portfolio', label: 'Portfolio', icon: I.Board, path: '/admin/portfolio' },
    { id: 'clients', label: 'Manage Clients', icon: I.Settings, path: '/admin/clients' },
    { id: 'team', label: 'Team & Access', icon: I.Library, path: '/admin/team' },
  ] },
  { group: 'Programs', items: [
    { id: 'newsletter', label: 'Newsletter Room', icon: I.Send, path: '/admin/newsletter' },
    { id: 'updates', label: 'Monthly Updates', icon: I.Calendar, path: '/admin/updates' },
    { id: 'guides', label: 'Guides', icon: I.Book, path: '/admin/guides' },
    { id: 'proposals', label: 'Proposals', icon: I.Doc, path: '/admin/proposals', soon: true },
  ] },
  { group: 'Insights', items: [
    { id: 'analytics', label: 'Engagement', icon: I.Chart, path: '/admin/analytics' },
    { id: 'health', label: 'Sync Health', icon: I.Gauge, path: '/admin/health' },
  ] },
];

const TITLES = {
  overview: { t: 'Dashboard', s: 'Everything that needs you, at a glance' },
  portfolio: { t: 'Portfolio', s: 'Every client at a glance' },
  clients: { t: 'Manage Clients', s: 'Accounts, integrations, and access' },
  team: { t: 'Team & Access', s: 'Who’s on each client’s team' },
  newsletter: { t: 'Newsletter Room', s: 'Open rounds, collect content, track engagement' },
  updates: { t: 'Monthly Updates', s: 'Review and publish client snapshots' },
  guides: { t: 'Guides', s: 'Author how-tos and shoot sheets (global or per client)' },
  proposals: { t: 'Proposals', s: 'Proposal system — management view' },
  analytics: { t: 'Engagement', s: 'How clients are using the portal' },
  health: { t: 'Sync Health', s: 'Integration status across every client' },
};

function sectionFromPath(pathname) {
  if (pathname === '/' || pathname === '/admin' || pathname === '/admin/') return 'overview';
  const seg = pathname.replace(/^\/admin\//, '').split('/')[0];
  return TITLES[seg] ? seg : 'overview';
}

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewCard({ label, value, tone, onClick }) {
  const c = tone === 'pink' ? 'var(--alloy-pink)' : tone === 'yellow' ? '#8a6900' : 'var(--alloy-purple)';
  return (
    <button onClick={onClick} className="card card-pad" style={{ flex: 1, minWidth: 150, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: c, marginTop: 4 }}>{value}</div>
    </button>
  );
}

function Overview({ go }) {
  const [d, setD] = useState({ clients: null, open: 0, past: 0, users: 0, drafts: 0, flagged: 0, rounds: 0 });
  useEffect(() => {
    getPortfolio().then((r) => {
      const real = (r.clients || []).filter((c) => c.tier !== 'internal');
      const t = real.reduce((a, c) => ({ open: a.open + c.openActions, past: a.past + c.pastDue, users: a.users + c.activeUsers }), { open: 0, past: 0, users: 0 });
      setD((p) => ({ ...p, clients: real.length, ...t }));
    }).catch(() => {});
    snapshotQueue().then((q) => setD((p) => ({ ...p, drafts: q.drafts || 0, flagged: q.flagged || 0 }))).catch(() => {});
    listNewsletterRequests().then((r) => setD((p) => ({ ...p, rounds: (r.requests || []).filter((x) => x.status === 'open').length }))).catch(() => {});
  }, []);
  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <OverviewCard label="Clients" value={d.clients ?? '—'} onClick={() => go('/admin/portfolio')} />
        <OverviewCard label="Open tickets" value={d.open} tone="pink" />
        <OverviewCard label="Past-due" value={d.past} tone="yellow" />
        <OverviewCard label="Active users (30d)" value={d.users} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)', margin: '4px 0 10px' }}>Needs you</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <OverviewCard label="Snapshot drafts" value={d.drafts} tone="yellow" onClick={() => go('/admin/updates')} />
        <OverviewCard label="Flagged snapshots" value={d.flagged} tone="pink" onClick={() => go('/admin/updates')} />
        <OverviewCard label="Open newsletter rounds" value={d.rounds} onClick={() => go('/admin/newsletter')} />
      </div>
    </div>
  );
}

// ── Team & Access (cross-client roster) ─────────────────────────────────────
function TeamAccess({ go }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const { accounts } = await listAccounts();
        const real = (accounts || []).filter((a) => a.tier !== 'internal').sort((a, b) => String(a.company).localeCompare(String(b.company)));
        const withInvites = await Promise.all(real.map(async (a) => {
          try { const r = await listInvites(a.id); return { account: a, invites: r.invites || [] }; }
          catch { return { account: a, invites: [] }; }
        }));
        setRows(withInvites);
      } catch (e) { setError(String(e.message || e)); }
    })();
  }, []);
  if (error) return <div className="card card-pad" style={{ color: 'var(--alloy-pink)' }}>{error}</div>;
  if (!rows) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading team roster…</div>;
  const totalPeople = rows.reduce((n, r) => n + r.invites.length, 0);
  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginBottom: 14 }}>{totalPeople} people across {rows.length} clients. Manage a client’s team from <button className="btn-link" onClick={() => go('/admin/clients')} style={{ background: 'none', border: 'none', color: 'var(--alloy-purple)', cursor: 'pointer', fontWeight: 700, padding: 0 }}>Manage Clients</button>.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(({ account, invites }) => (
          <div key={account.id} className="card" style={{ padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: invites.length ? '1px solid var(--border-subtle)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--alloy-purple)', flex: 1 }}>{account.short_name || account.company}</span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{invites.length} {invites.length === 1 ? 'person' : 'people'}</span>
            </div>
            {invites.map((inv) => (
              <div key={inv.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{inv.name || inv.email}</div>
                  {inv.name ? <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{inv.email}</div> : null}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--alloy-off-white)', color: 'var(--fg-muted)', textTransform: 'capitalize' }}>{inv.role || 'owner'}</span>
                {inv.is_staff ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)' }}>Alloy staff</span> : null}
              </div>
            ))}
            {invites.length === 0 ? <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--fg-muted)' }}>No one invited yet.</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Proposals (management — in the works) ───────────────────────────────────
function AdminProposals({ go }) {
  const [accounts, setAccounts] = useState(null);
  useEffect(() => { listAccounts().then((r) => setAccounts(r.accounts || [])).catch(() => setAccounts([])); }, []);
  const enabled = (accounts || []).filter((a) => a.proposals_enabled);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="card card-pad" style={{ marginBottom: 16, background: 'var(--alloy-yellow-tint)', border: '1px solid var(--alloy-yellow)' }}>
        <div style={{ fontWeight: 800, color: '#8a6900', fontSize: 13.5, marginBottom: 3 }}>🚧 In the works</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>The proposal system (CAM intake → match → send → track) lives inside each client’s portal for now. This management view is a placeholder — cross-client proposal analytics and controls will land here.</div>
      </div>
      {accounts === null ? <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading…</div> : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>Proposals-enabled clients · {enabled.length}</div>
          {enabled.length === 0 ? <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--fg-muted)' }}>No clients have proposals enabled yet.</div> : enabled.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--alloy-purple)' }}>{a.short_name || a.company}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => go(`/c/${a.id}/proposals`)}>Open cockpit →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────
function AdminShell({ onSignOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNav, setMobileNav] = useState(false);
  const section = sectionFromPath(location.pathname);
  const sp = new URLSearchParams(location.search);
  const go = (path) => { navigate(path); setMobileNav(false); window.scrollTo(0, 0); };
  const title = TITLES[section] || TITLES.overview;

  const content = (() => {
    switch (section) {
      case 'portfolio': return <PortfolioGrid onEnter={(id) => go(`/c/${id}`)} onEditClient={(id) => go(`/admin/clients?client=${id}`)} onAddClient={() => go('/admin/clients?new=1')} />;
      case 'clients': return <AdminScreen embed startNew={sp.get('new') === '1'} selectId={sp.get('client')} />;
      case 'team': return <TeamAccess go={go} />;
      case 'newsletter': return <AdminNewsletter />;
      case 'updates': return (
        <div style={{ maxWidth: 900 }}>
          <SnapshotQueue onReview={(id) => go(`/c/${id}/snapshot`)} />
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>“Review” opens a client’s snapshot to edit the headline/note before publishing.</div>
        </div>
      );
      case 'guides': return <AdminGuides />;
      case 'proposals': return <AdminProposals go={go} />;
      case 'analytics': return <AdminAnalytics />;
      case 'health': return <SyncHealth />;
      default: return <Overview go={go} />;
    }
  })();

  return (
    <div className="app density-comfortable" data-bg="off">
      {/* Mobile top bar */}
      <div className="mobile-bar">
        <div className="brand"><img className="mb-mark" src="/alloy-icon.png" alt="Alloy" style={{ width: 30, height: 30, borderRadius: 7 }} /> Admin</div>
        <button className="mobile-bar-menu" aria-label="Menu" onClick={() => setMobileNav(!mobileNav)}>
          {mobileNav ? <I.Close width={22} height={22} /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
      </div>

      <div className={`sidebar-wrap ${mobileNav ? 'open' : ''}`}>
        <aside className="sidebar">
          <div className="alloy-strip">
            <img className="alloy-mark" src="/alloy-icon.png" alt="Alloy" />
            <span className="alloy-word">Alloy</span>
            <span className="alloy-divider" />
            <span className="alloy-tag">Admin</span>
          </div>
          <nav className="sidebar-nav">
            {NAV.map((grp, gi) => (
              <React.Fragment key={gi}>
                {grp.group ? <div className="nav-section-label has-divider">{grp.group}</div> : null}
                {grp.items.map((it) => (
                  <div key={it.id} className="nav-item" data-active={section === it.id} onClick={() => go(it.path)}>
                    <span className="icon"><it.icon /></span>
                    <span>{it.label}</span>
                    {it.soon ? <span className="nav-soon-tag">Soon</span> : null}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="sidebar-mobile-signout" onClick={onSignOut}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
              Sign out
            </button>
          </div>
        </aside>
        <div className="sidebar-scrim" onClick={() => setMobileNav(false)} />
      </div>

      <main className="main">
        <div className="main-header">
          <div>
            <h1>{title.t}</h1>
            <span className="sub">{title.s}</span>
          </div>
          <div className="grow" />
          <button className="btn btn-secondary btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
        <div className="content">{content}</div>
      </main>
    </div>
  );
}

export default AdminShell;
