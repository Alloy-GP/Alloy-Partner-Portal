import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';

// Assets — the client's library of finished deliverables, synced from their
// Monday "Assets" board (DATA.assets). Grouped into category sections, filterable
// by category tab + search. Ported from the Assets Page design handoff.

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function monthValue(label) {
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(label || '');
  if (!m) return 0;
  const mi = MONTHS[m[1].toLowerCase()];
  return mi == null ? 0 : Number(m[2]) * 12 + mi;
}

// Meta line under a card: "SVG · PNG · EPS · Vector · Feb 2026"
function metaLine(a) {
  return [...(a.formats || []), a.spec, a.updated].filter(Boolean).join(' · ');
}

// Decorative brand swatches for the kit hero (client palette not yet synced).
const KIT_SWATCHES = ['var(--alloy-purple)', 'var(--alloy-pink)', 'var(--alloy-yellow)', 'var(--alloy-blue)', 'var(--alloy-green)'];

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
  const company = DATA.account?.company || 'your team';
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');

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

  const lastUpdated = React.useMemo(() => {
    let best = null, bestV = -1;
    for (const a of assets) { const v = monthValue(a.updated); if (v > bestV) { bestV = v; best = a.updated; } }
    return best || '—';
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
      {/* Header */}
      <div className="assets-head">
        <div className="assets-head-titles">
          <h1>Assets</h1>
          <div className="assets-sub">Everything Alloy has made for {company}</div>
        </div>
        <div className="assets-head-actions">
          <label className="assets-search">
            <I.Search width={15} height={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" />
          </label>
          <button className="assets-kit-btn"><I.Download width={15} height={15} /> Download full kit (.zip)</button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="assets-empty">No assets yet — your finished deliverables will appear here as Alloy ships them.</div>
      ) : (
        <>
          {/* Brand-kit hero */}
          <div className="assets-kit">
            <div className="assets-kit-body">
              <div className="assets-kit-eyebrow">Brand kit</div>
              <div className="assets-kit-title">Everything Alloy has made for {company}</div>
              <div className="assets-kit-sub">
                Your full library of finished deliverables — logos, email signatures, print &amp; direct mail,
                social templates, sales collateral and event assets. Grab one file, or download the whole kit.
              </div>
              <div className="assets-kit-meta">
                <div className="m"><b>{assets.length}</b><span>Deliverables</span></div>
                <div className="m"><b>{categories.length}</b><span>Categories</span></div>
                <div className="m"><b>{lastUpdated}</b><span>Last updated</span></div>
              </div>
            </div>
            <div className="assets-kit-actions">
              <button className="assets-kit-btn"><I.Download width={15} height={15} /> Download full kit (.zip)</button>
              <div className="assets-kit-swatches">
                {KIT_SWATCHES.map((c, i) => <span key={i} style={{ background: c }} />)}
              </div>
            </div>
          </div>

          {/* Category tabs */}
          <div className="assets-tabs">
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
            return (
              <section key={cat}>
                <div className="asset-sec">{cat}<span className="n">{items.length}</span></div>
                <div className="asset-grid">
                  {items.map((a) => <AssetCard key={a.id} a={a} />)}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export default AssetsScreen;
