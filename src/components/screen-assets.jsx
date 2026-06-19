import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { supabase } from '../lib/supabase.js';

// Assets — the client's library of finished deliverables, synced from their
// Dash DAM brand folder (sync-dash-assets → DATA.assets). Grouped into category
// sections (Dash subfolders), filterable by category tab + search.

// Cards shown per category before paging — ~2 rows at typical widths.
const PER_PAGE = 8;

// Meta line under a card: "SVG · PNG · EPS · Vector · Feb 2026"
function metaLine(a) {
  return [...(a.formats || []), a.spec, a.updated].filter(Boolean).join(' · ');
}

function AssetCard({ a }) {
  const open = () => { if (a.download && a.download !== '#') window.open(a.download, '_blank', 'noopener'); };
  return (
    <div className="asset-card" role="button" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}>
      <div className="asset-thumb">
        {a.format ? <span className="asset-fmt">{a.format}</span> : null}
        {a.fileCount ? <span className="asset-files">{a.fileCount} files</span> : null}
        {a.thumb
          ? <img src={a.thumb} alt="" loading="lazy" />
          : <span className="asset-glyph">{a.format || 'FILE'}</span>}
        <div className="asset-dl-over">
          <span className="asset-dl-btn"><I.Download width={15} height={15} /> Download</span>
        </div>
      </div>
      <div className="asset-body">
        <div className="asset-name">{a.name}</div>
        {a.note ? <div className="asset-note">{a.note}</div> : null}
      </div>
      <div className="asset-foot">
        <span className="asset-meta">{metaLine(a)}</span>
        <button className="asset-iconbtn" aria-label={`Download ${a.name}`}
          onClick={(e) => { e.stopPropagation(); open(); }}>
          <I.Download width={15} height={15} />
        </button>
      </div>
    </div>
  );
}

export function AssetsScreen() {
  const assets = DATA.assets || [];
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  // Per-category page index — big categories collapse to ~2 rows and page through.
  const [pages, setPages] = React.useState({});
  // Reset paging whenever the filter (tab/search) changes.
  React.useEffect(() => { setPages({}); }, [tab, q]);

  // Admin-only on-demand sync from Dash (daily cron handles the rest).
  const isStaff = !!(DATA.user && DATA.user.isStaff);
  // Per-brand Dash guest-upload link (falls back to the shared DAM).
  const uploadUrl = (DATA.account && DATA.account.dashUploadUrl) || 'https://dam.alloygp.co';
  const [sync, setSync] = React.useState('idle'); // idle | running | done | error
  const runSync = async () => {
    if (sync === 'running') return;
    setSync('running');
    try {
      const { error } = await supabase.functions.invoke('sync-dash-assets', { body: {} });
      if (error) throw error;
      setSync('done');
      // Reload so the freshly-synced assets render.
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      console.error('Dash sync failed', e);
      setSync('error');
    }
  };
  const syncButton = isStaff ? (
    <button className={`assets-sync-btn${sync === 'running' ? ' is-running' : ''}`} onClick={runSync} disabled={sync === 'running'}
      title="Pull the latest from Dash now (otherwise syncs daily)">
      <svg className="assets-sync-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v4h-4" />
      </svg>
      {sync === 'running' ? 'Syncing…' : sync === 'error' ? 'Sync failed — retry' : sync === 'done' ? 'Synced ✓' : 'Sync from Dash'}
    </button>
  ) : null;

  // Category order = first-appearance order in the (already sorted) data.
  const categories = React.useMemo(() => {
    const seen = [];
    for (const a of assets) if (a.category && !seen.includes(a.category)) seen.push(a.category);
    return seen;
  }, [assets]);

  const counts = React.useMemo(() => {
    const c = {};
    for (const a of assets) c[a.category] = (c[a.category] || 0) + 1;
    return c;
  }, [assets]);

  const needle = q.trim().toLowerCase();
  const matches = (a) => {
    if (tab !== 'all' && a.category !== tab) return false;
    if (!needle) return true;
    return [a.name, a.note, a.category, a.format, (a.formats || []).join(' '), a.spec]
      .filter(Boolean).join(' ').toLowerCase().includes(needle);
  };
  const visibleCats = categories.filter((cat) => assets.some((a) => a.category === cat && matches(a)));

  return (
    <div className="assets-screen">
      {assets.length === 0 ? (
        <div className="assets-empty">
          No assets yet — your finished deliverables will appear here as Alloy ships them.
          {isStaff ? <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>{syncButton}</div> : null}
        </div>
      ) : (
        <>
          {/* Brand-kit hero */}
          <div className="assets-kit">
            <div className="assets-kit-body">
              <div className="assets-kit-eyebrow">Brand kit</div>
              <div className="assets-kit-title">Everything We've Made Together</div>
              <div className="assets-kit-sub">
                Your full library of finished deliverables — logos, email signatures, print &amp; direct mail,
                social templates, sales collateral and event assets. Download any file you need.
              </div>
              <div className="assets-kit-meta">
                <div className="m"><b>{assets.length}</b><span>Deliverables</span></div>
                <div className="m"><b>{categories.length}</b><span>Categories</span></div>
              </div>
            </div>
            <div className="assets-kit-actions">
              <a className="assets-kit-btn" href={uploadUrl} target="_blank" rel="noopener noreferrer">
                <I.Upload width={15} height={15} /> Upload assets
              </a>
              {syncButton}
            </div>
          </div>

          {/* Category tabs — search leads the filter list */}
          <div className="assets-tabs">
            <label className="assets-search">
              <I.Search width={15} height={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" />
            </label>
            <button className={`assets-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
              All <span className="n">{assets.length}</span>
            </button>
            {categories.map((cat) => (
              <button key={cat} className={`assets-tab${tab === cat ? ' active' : ''}`} onClick={() => setTab(cat)}>
                {cat} <span className="n">{counts[cat]}</span>
              </button>
            ))}
          </div>

          {/* Sections */}
          {visibleCats.length === 0 ? (
            <div className="assets-empty">No assets match “{q}”.</div>
          ) : visibleCats.map((cat) => {
            const items = assets.filter((a) => a.category === cat && matches(a));
            const totalPages = Math.ceil(items.length / PER_PAGE);
            const page = Math.min(pages[cat] || 0, totalPages - 1);
            const start = page * PER_PAGE;
            const shown = items.slice(start, start + PER_PAGE);
            const go = (p) => setPages((prev) => ({ ...prev, [cat]: Math.max(0, Math.min(p, totalPages - 1)) }));
            return (
              <section key={cat}>
                <div className="asset-sec">{cat}<span className="n">{items.length}</span></div>
                <div className="asset-grid">
                  {shown.map((a) => <AssetCard key={a.id} a={a} />)}
                </div>
                {totalPages > 1 ? (
                  <div className="asset-pager">
                    <button className="asset-pager-btn" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">
                      <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><I.Chevron width={16} height={16} /></span>
                    </button>
                    <span className="asset-pager-info">{start + 1}–{Math.min(start + PER_PAGE, items.length)} of {items.length}</span>
                    <button className="asset-pager-btn" onClick={() => go(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page">
                      <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><I.Chevron width={16} height={16} /></span>
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export default AssetsScreen;
