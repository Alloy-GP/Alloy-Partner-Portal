// ============================================================
// Roadmap — multi-location "track" model (the Growth Journey card).
// Each market is a track on the same five-stage journey. Data: DATA.locations
// (synced from each client's Monday "Markets" board via sync-monday-roadmap).
// v11: rail NODES are the stage navigation (click a node to view that stage);
// coins carry hover tooltips; axis shows stage names only. Engine card = Phase 3.
// ============================================================
import React from 'react';
import { DATA } from '../data.js';
import { ENGINES, ENGINE_ORDER, enginesOf } from '../lib/engines.js';

const R_PURPLE = "#381c4f", R_PINK = "#d9356e", R_GREEN = "#2c7d68", R_YELLOW = "#f5d880";

// The five canonical stages (index = stage).
const STAGES_DEF = [
  { key: "foundation", name: "Foundation" },
  { key: "traction",   name: "Traction" },
  { key: "momentum",   name: "Momentum" },
  { key: "expansion",  name: "Expansion" },
  { key: "dominance",  name: "Dominance" },
];

// Canonical milestones per stage: { key (stable, = COIN_ICONS key + sync label),
// label (short display), detail (tooltip) }. key must match sync-monday-roadmap.
const STAGE_MILESTONES = {
  foundation: [
    { key: "Access & credentials secured", label: "Access secured", detail: "Admin access to site, GBP, analytics and ad accounts handed over and verified." },
    { key: "Master brief & sitemap built", label: "Brief & sitemap", detail: "Strategy brief, keyword map and site architecture approved as the build blueprint." },
    { key: "Site live · technical SEO passing", label: "Site live", detail: "Site published and passing technical SEO — crawlable, fast, indexed, no blockers." },
    { key: "Tracking live · baseline captured", label: "Tracking live", detail: "GA4, call tracking and conversions firing; opening baseline numbers recorded." },
    { key: "GBP optimized · proposal ready", label: "GBP & proposal", detail: "Google Business Profile fully optimized and the premium proposal kit ready to send." },
  ],
  traction: [
    { key: "Target clusters ranking page 1", label: "First page-1 rankings", detail: "Priority keyword clusters breaking onto page one of search results." },
    { key: "GBP in local pack · calls climbing", label: "In the local pack", detail: "Google Business Profile surfacing in the map pack; calls and direction requests rising." },
    { key: "Qualified leads flowing & rising", label: "Leads flowing", detail: "A steady, growing stream of qualified inbound leads attributed to the engine." },
    { key: "First Alloy-sourced boards signed", label: "First boards signed", detail: "First new board contracts won that trace directly back to Alloy's work." },
    { key: "Reviews building · pipeline fuller", label: "Reviews building", detail: "Review volume and rating climbing as the reputation engine kicks in." },
  ],
  momentum: [
    { key: "Broad rankings across clusters", label: "Broad rankings", detail: "Ranking across many clusters, not just the first few — visibility is widespread." },
    { key: "Flywheel engaging", label: "Flywheel engaging", detail: "Rankings → leads → reviews → more rankings now compounding on their own." },
    { key: "Reputation feeding demand", label: "Reputation engine", detail: "Reviews and word-of-mouth actively generating inbound demand." },
    { key: "Boards retained · low churn", label: "Boards retained", detail: "Existing boards renewing and staying — churn is low and predictable." },
    { key: "New front chosen & resourced", label: "Next market chosen", detail: "The next market to open has been picked and resourced to launch." },
  ],
  expansion: [
    { key: "Leading visibility across markets", label: "Multi-market lead", detail: "Leading share of search visibility across every active market, not just the flagship." },
    { key: "Expansion tracks producing", label: "New markets producing", detail: "Newly opened markets generating their own rankings, leads and signings." },
    { key: "Share of voice ahead of rivals", label: "Ahead of rivals", detail: "Share of voice measurably ahead of the nearest competitors." },
    { key: "Compounding economics visible", label: "Compounding returns", detail: "Cost per lead falling while volume rises — the economics are compounding." },
    { key: "The recognized name in market", label: "The known name", detail: "Recognized as the category's go-to name across the region." },
  ],
  dominance: [
    { key: "Owned rankings defended", label: "Rankings defended", detail: "Top positions held and defended against challengers quarter over quarter." },
    { key: "Share of voice holding/growing", label: "Share of voice held", detail: "Share of voice steady or still growing at the front of the market." },
    { key: "AI-search presence keeping pace", label: "AI-search presence", detail: "Cited and surfaced in AI search and assistants, keeping pace with the shift." },
    { key: "Leads & retention steady/growing", label: "Leads & retention", detail: "Lead flow and board retention both steady or growing — no slippage." },
    { key: "Compounding economics holding", label: "Economics holding", detail: "Unit economics holding at their best levels as the lead is maintained." },
  ],
};

// One color per stage (coin disc).
const STAGE_COIN = {
  foundation: { solid: "#2f6b51", g0: "#dcebe3", g1: "#c9e1d5" },
  traction:   { solid: "#1a4a72", g0: "#dcecf7", g1: "#c4ddf0" },
  momentum:   { solid: "#c12a60", g0: "#fbe2eb", g1: "#f6cdda" },
  expansion:  { solid: "#7a5a14", g0: "#fbf2d6", g1: "#f1e3b0" },
  dominance:  { solid: "#381c4f", g0: "#ece8f1", g1: "#ddd5e8" },
};
const COIN_LOCK = '<rect x="5.5" y="11" width="13" height="8.5" rx="2"></rect><path d="M8.5 11 V7.5 a3.5 3.5 0 0 1 7 0 V11"></path><circle cx="12" cy="15.2" r="1.15" fill="currentColor" stroke="none"></circle>';
// Keyed by the milestone's stable `key`.
const COIN_ICONS = {
  "Access & credentials secured": '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z"></path><path d="M9 12 L11 14 L15 10"></path>',
  "Master brief & sitemap built": '<path d="M7 3 H14 L18.5 7.5 V20 C18.5 20.5 18 21 17.5 21 H7 C6.5 21 6 20.5 6 20 V4 C6 3.5 6.5 3 7 3 Z"></path><polyline points="14 3 14 8 18.5 8"></polyline><path d="M9 14 H15"></path><path d="M9 17 H13"></path>',
  "Site live · technical SEO passing": '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9 H21"></path><circle cx="6" cy="6.5" r="0.7" fill="currentColor" stroke="none"></circle><circle cx="8" cy="6.5" r="0.7" fill="currentColor" stroke="none"></circle><circle cx="10" cy="6.5" r="0.7" fill="currentColor" stroke="none"></circle><path d="M7 13 H17"></path><path d="M7 16 H13"></path>',
  "Tracking live · baseline captured": '<path d="M4 4 V19 H20"></path><path d="M7 15 L11 11 L14 13 L19 7"></path><circle cx="11" cy="11" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="14" cy="13" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="19" cy="7" r="1.2" fill="currentColor" stroke="none"></circle>',
  "GBP optimized · proposal ready": '<path d="M12 21 C12 21 5 14 5 9.5 C5 5.9 8.1 3 12 3 C15.9 3 19 5.9 19 9.5 C19 14 12 21 12 21 Z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
  "Target clusters ranking page 1": '<path d="M8 4 H16 V8.5 C16 11.5 14.2 13.5 12 13.5 C9.8 13.5 8 11.5 8 8.5 Z"></path><path d="M8 5.5 H5 V7.2 C5 9 6.4 10.3 8.2 10.4"></path><path d="M16 5.5 H19 V7.2 C19 9 17.6 10.3 15.8 10.4"></path><path d="M12 13.5 V17"></path><path d="M10 17 H14 L14.6 20 H9.4 Z"></path>',
  "GBP in local pack · calls climbing": '<path d="M12 21 C12 21 5 14 5 9.5 C5 5.9 8.1 3 12 3 C15.9 3 19 5.9 19 9.5 C19 14 12 21 12 21 Z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
  "Qualified leads flowing & rising": '<circle cx="10" cy="8" r="3.2"></circle><path d="M4 19 C4 15.4 6.6 13.4 10 13.4 C11.9 13.4 13.6 14.1 14.7 15.3"></path><path d="M15.5 12.5 L20 8"></path><polyline points="20 11.2 20 8 16.8 8"></polyline>',
  "First Alloy-sourced boards signed": '<circle cx="12" cy="9" r="5.5"></circle><circle cx="12" cy="9" r="2.1"></circle><path d="M9.2 13.6 L8 21 L12 18.4 L16 21 L14.8 13.6"></path>',
  "Reviews building · pipeline fuller": '<path d="M12 4 L13.8 8.5 L18.5 8.9 L14.9 12.1 L16 16.7 L12 14.2 L8 16.7 L9.1 12.1 L5.5 8.9 L10.2 8.5 Z"></path>',
  "Broad rankings across clusters": '<path d="M8 4 H16 V8.5 C16 11.5 14.2 13.5 12 13.5 C9.8 13.5 8 11.5 8 8.5 Z"></path><path d="M8 5.5 H5 V7.2 C5 9 6.4 10.3 8.2 10.4"></path><path d="M16 5.5 H19 V7.2 C19 9 17.6 10.3 15.8 10.4"></path><path d="M12 13.5 V17"></path><path d="M10 17 H14 L14.6 20 H9.4 Z"></path>',
  "Flywheel engaging": '<path d="M12 3 C14.6 5.6 15.6 9.2 15 13 H9 C8.4 9.2 9.4 5.6 12 3 Z"></path><circle cx="12" cy="8.4" r="1.6"></circle><path d="M9 13 L6.4 15.6 V18.2 H9"></path><path d="M15 13 L17.6 15.6 V18.2 H15"></path><path d="M10.4 17.8 C11 20.4 13 20.4 13.6 17.8"></path>',
  "Reputation feeding demand": '<path d="M12 4 L13.8 8.5 L18.5 8.9 L14.9 12.1 L16 16.7 L12 14.2 L8 16.7 L9.1 12.1 L5.5 8.9 L10.2 8.5 Z"></path>',
  "Boards retained · low churn": '<path d="M20 8 A8 8 0 0 0 6 6.5"></path><polyline points="20 4 20 8 16 8"></polyline><path d="M4 16 A8 8 0 0 0 18 17.5"></path><polyline points="4 20 4 16 8 16"></polyline>',
  "New front chosen & resourced": '<path d="M6 21 V4"></path><path d="M6 4 H17 L14.5 8 L17 12 H6"></path>',
  "Leading visibility across markets": '<circle cx="12" cy="12" r="9"></circle><path d="M3 12 H21"></path><path d="M12 3 C15.2 6 15.2 18 12 21 C8.8 18 8.8 6 12 3 Z"></path>',
  "Expansion tracks producing": '<path d="M4 4 V20 H20"></path><path d="M7 16 L11 12 L14 14 L19 9"></path><polyline points="19 13 19 9 15 9"></polyline>',
  "Share of voice ahead of rivals": '<path d="M3 10 V14 H6 L18 19 V5 L6 10 Z"></path><path d="M18 9 C19.6 10.2 19.6 13.8 18 15"></path><path d="M7 14 L8 19 H10 L9 14"></path>',
  "Compounding economics visible": '<circle cx="12" cy="12" r="8.5"></circle><path d="M14.5 9 C13.9 8.1 13 7.7 12 7.7 C10.4 7.7 9.4 8.6 9.4 9.8 C9.4 12.4 14.6 11.3 14.6 13.9 C14.6 15.2 13.5 16.2 12 16.2 C10.9 16.2 9.9 15.7 9.4 14.7"></path><path d="M12 6 V7.7"></path><path d="M12 16.2 V18"></path>',
  "The recognized name in market": '<path d="M4 8 L7.5 14 L12 6.5 L16.5 14 L20 8 L18.3 18.5 H5.7 Z"></path><path d="M5.7 18.5 H18.3"></path>',
  "Owned rankings defended": '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z"></path><path d="M9 12 L11 14 L15 10"></path>',
  "Share of voice holding/growing": '<path d="M3 12 H7 L9 6.5 L12 17.5 L14.5 11 L16.5 13 H21"></path>',
  "AI-search presence keeping pace": '<path d="M11 4 C11.6 8.2 12.8 9.4 17 10 C12.8 10.6 11.6 11.8 11 16 C10.4 11.8 9.2 10.6 5 10 C9.2 9.4 10.4 8.2 11 4 Z"></path><path d="M17.5 14 C17.7 15.8 18.2 16.3 20 16.5 C18.2 16.7 17.7 17.2 17.5 19 C17.3 17.2 16.8 16.7 15 16.5 C16.8 16.3 17.3 15.8 17.5 14 Z"></path>',
  "Leads & retention steady/growing": '<path d="M12 20 C12 20 4 14.5 4 9 C4 6.4 6 4.5 8.5 4.5 C10.1 4.5 11.3 5.3 12 6.6 C12.7 5.3 13.9 4.5 15.5 4.5 C18 4.5 20 6.4 20 9 C20 14.5 12 20 12 20 Z"></path>',
  "Compounding economics holding": '<circle cx="12" cy="12" r="8.5"></circle><path d="M14.5 9 C13.9 8.1 13 7.7 12 7.7 C10.4 7.7 9.4 8.6 9.4 9.8 C9.4 12.4 14.6 11.3 14.6 13.9 C14.6 15.2 13.5 16.2 12 16.2 C10.9 16.2 9.9 15.7 9.4 14.7"></path><path d="M12 6 V7.7"></path><path d="M12 16.2 V18"></path>',
};

function RDot({ c, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: c, flexShrink: 0, display: "inline-block" }} />;
}
const RIc = {
  check: (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  chevron: (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  lock: (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  pin: (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  trend: (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></svg>,
};

// ---- coin milestone badge (with hover tooltip) ----
function RMedal({ m, stageKey, size = 74 }) {
  const c = STAGE_COIN[stageKey] || STAGE_COIN.foundation;
  const done = m.done, fresh = m.fresh;
  const [tip, setTip] = React.useState(false);
  const gid = "coin-" + stageKey + "-" + (m.key || m.label || "").replace(/[^a-z0-9]/gi, "").slice(0, 14) + "-" + (done ? "d" : "l");
  const glyph = done ? (COIN_ICONS[m.key] || COIN_ICONS[m.label]) : COIN_LOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 9, width: 158 }}>
      <div className={fresh ? "coin-holder halo" : "coin-holder"}
        onMouseEnter={() => m.detail && setTip(true)} onMouseLeave={() => setTip(false)}
        style={{ position: "relative", width: size, height: size, "--halo": c.solid, cursor: m.detail ? "help" : "default" }}>
        {tip && m.detail && (
          <div role="tooltip" style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", width: 196, zIndex: 30, background: "#2c1444", color: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 10px 26px rgba(56,28,79,0.34)", pointerEvents: "none" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 11.5, fontWeight: 800, marginBottom: 3, color: done ? "#fff" : "#e8def3" }}>{m.label}{!done && " · upcoming"}</div>
            <div style={{ fontSize: 11, lineHeight: 1.4, color: "rgba(255,255,255,0.78)", fontWeight: 500 }}>{m.detail}</div>
            <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "7px solid #2c1444" }} />
          </div>
        )}
        <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={m.label}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={done ? c.g0 : "#f3f1f7"} />
              <stop offset="100%" stopColor={done ? c.g1 : "#ece8f1"} />
            </linearGradient>
          </defs>
          {done ? (
            <React.Fragment>
              <circle cx="50" cy="50" r="48" fill={c.solid} />
              <circle cx="50" cy="50" r="44" fill={`url(#${gid})`} />
              <circle cx="50" cy="50" r="40" fill="none" stroke={c.solid} strokeWidth="1.5" opacity="0.35" />
            </React.Fragment>
          ) : (
            <React.Fragment>
              <circle cx="50" cy="50" r="44" fill={`url(#${gid})`} />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#c4bcd2" strokeWidth="2.4" strokeDasharray="3 5" strokeLinecap="round" />
            </React.Fragment>
          )}
          <g transform="translate(29 29) scale(1.75)" color={done ? c.solid : "#b1a8c0"}>
            <g fill="none" stroke="currentColor" strokeWidth="1.486" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: glyph }} />
          </g>
        </svg>
        {done && (
          <svg width={size * 0.27} height={size * 0.27} viewBox="0 0 24 24" style={{ position: "absolute", right: -1, bottom: -1 }}>
            <circle cx="12" cy="12" r="11" fill={c.solid} stroke="#fff" strokeWidth="2" />
            <path d="M7.5 12.3l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: done ? "#43406a" : "#9a93a8", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.label}</div>
        {fresh && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: c.solid, marginTop: 3 }}>JUST HIT</div>}
      </div>
    </div>
  );
}

function JourneyRail({ locations }) {
  const N = STAGES_DEF.length;
  const centerPct = (i) => ((i + 0.5) / N) * 100;
  const [open, setOpen] = React.useState(null); // all collapsed by default
  const [hover, setHover] = React.useState(null);
  const [stageView, setStageView] = React.useState({});
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const selectStage = (id, i, e) => { e.stopPropagation(); setOpen(id); setStageView((s) => ({ ...s, [id]: i })); };

  const projects = DATA.projects || [];
  const stats = [
    { n: locations.length, l: "active markets", c: R_PURPLE },
    { n: projects.filter((p) => p.status === "live").length, l: "initiatives delivered", c: R_GREEN },
    { n: projects.filter((p) => p.status !== "live").length, l: "in motion now", c: R_PINK },
  ];

  return (
    <div style={{ background: "#fff", border: "1px solid #ece8f1", borderRadius: 16, padding: "22px 26px 26px", marginBottom: 26, boxShadow: "0 2px 10px rgba(56,28,79,0.05)" }}>
      {/* header: title left, portfolio stats right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flex: "1 1 auto", minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: R_PURPLE, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><RIc.trend s={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: R_PURPLE, letterSpacing: "-0.01em" }}>The growth journey</div>
            <div style={{ fontSize: 12, color: "#8a8395", fontWeight: 600 }}>Every market climbs the same five stages. Here's where each of yours stands today.</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 0, flexShrink: 0 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "0 22px", borderLeft: i > 0 ? "1px solid #e8e2f0" : "none" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: s.c, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.n}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a8395", marginTop: 6 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* separation line */}
      <div style={{ height: 1, background: "#ece8f1", margin: "0 0 30px" }} />

      {/* stage axis header — names only */}
      <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${N}, 1fr) 132px`, alignItems: "end", marginBottom: 10, padding: "0 14px" }}>
        <div />
        {STAGES_DEF.map((st) => (
          <div key={st.key} style={{ textAlign: "center", padding: "0 6px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12.5, fontWeight: 800, color: R_PURPLE, letterSpacing: "-0.01em" }}>{st.name}</div>
          </div>
        ))}
        <div />
      </div>

      {/* market rows */}
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 10 }}>
        {locations.map((loc) => {
          const stg = loc.stage;
          const isOpen = open === loc.id;
          const hovered = hover === loc.id;
          const lit = isOpen || hovered; // pink accents light up on hover or when open
          const vStage = isOpen ? (stageView[loc.id] ?? loc.stage) : loc.stage;
          return (
            <div key={loc.id}
              onMouseEnter={() => setHover(loc.id)} onMouseLeave={() => setHover((h) => (h === loc.id ? null : h))}
              style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #ece8f1", background: "#fff", boxShadow: isOpen ? "0 6px 20px rgba(56,28,79,0.08)" : "none", transition: "box-shadow .18s" }}>
              <div onClick={() => toggle(loc.id)} role="button" style={{
                display: "grid", gridTemplateColumns: `200px repeat(${N}, 1fr) 132px`, alignItems: "center",
                cursor: "pointer", padding: "16px 14px", background: hovered && !isOpen ? "#faf7fd" : "#fff",
                opacity: open == null ? 1 : (isOpen ? 1 : (hovered ? 0.74 : 0.46)), transition: "opacity .18s, background .18s",
              }}>
                {/* label */}
                <div style={{ paddingRight: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: lit ? R_PINK : "#9a8fb0", display: "flex" }}><RIc.pin s={13} /></span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: R_PURPLE, letterSpacing: "-0.01em" }}>{loc.name}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#a8a0b5", fontWeight: 600, marginTop: 3, paddingLeft: 20 }}>{[loc.role, loc.age].filter(Boolean).join(" · ")}</div>
                </div>

                {/* rail across stages — nodes navigate */}
                <div style={{ gridColumn: `2 / span ${N}`, position: "relative", height: 38 }}>
                  <span style={{ position: "absolute", top: 18, left: `${centerPct(0)}%`, width: `${centerPct(N - 1) - centerPct(0)}%`, height: 4, background: "#e4ddee", borderRadius: 999 }} />
                  <span style={{ position: "absolute", top: 18, left: `${centerPct(0)}%`, width: `${centerPct(stg) - centerPct(0)}%`, height: 4, background: `linear-gradient(90deg, ${R_GREEN}, ${stg === 0 ? R_GREEN : R_PINK})`, borderRadius: 999 }} />
                  {STAGES_DEF.map((st, i) => {
                    const cleared = i < stg, current = i === stg;
                    const viewing = isOpen && i === vStage;
                    const ring = viewing ? (current ? "rgba(217,53,110,0.20)" : cleared ? "rgba(44,125,104,0.22)" : "rgba(120,110,140,0.18)") : null;
                    return (
                      <span key={i} title={st.name} onClick={(e) => selectStage(loc.id, i, e)} className="rail-node"
                        style={{ position: "absolute", top: 18, left: `${centerPct(i)}%`, transform: "translate(-50%, -50%)", zIndex: 2, cursor: "pointer", padding: 7, borderRadius: 999, background: ring || "transparent" }}>
                        {current ? (
                          <span className="rail-dot" style={{ width: 26, height: 26, borderRadius: 999, background: R_PINK, color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 0 0 5px rgba(217,53,110,0.16)", border: "2.5px solid #fff" }}><RDot c="#fff" size={7} /></span>
                        ) : cleared ? (
                          <span className="rail-dot" style={{ width: 22, height: 22, borderRadius: 999, background: R_GREEN, color: "#fff", display: "grid", placeItems: "center", border: "2.5px solid #fff" }}><RIc.check s={11} /></span>
                        ) : (
                          <span className="rail-dot" style={{ width: 16, height: 16, borderRadius: 999, background: "#fff", border: "2px dashed #cdbfe0", display: "block" }} />
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* right: chevron only */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingLeft: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", flexShrink: 0, background: lit ? R_PINK : "#ece5f3", color: lit ? "#fff" : "#9a93a8", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .18s, background .15s, color .15s" }}><RIc.chevron s={15} /></span>
                </div>
              </div>

              {/* expansion: viewed stage's milestone coins (aligned to the rail) */}
              {isOpen && (() => {
                const vKey = STAGES_DEF[vStage].key;
                const vName = STAGES_DEF[vStage].name;
                const vMedals = STAGE_MILESTONES[vKey].map((m, i) => {
                  let done = false, fresh = false;
                  if (vStage < loc.stage) done = true;
                  else if (vStage === loc.stage) {
                    const lm = (loc.milestones || []).find((x) => x.idx === i);
                    done = !!(lm && lm.done);
                    fresh = i === loc.msFresh;
                  }
                  return { ...m, done, fresh };
                });
                const vDone = vMedals.filter((m) => m.done).length;
                const nextName = STAGES_DEF[vStage + 1] && STAGES_DEF[vStage + 1].name;
                const rel = vStage < loc.stage ? "Cleared ✓" : vStage === loc.stage ? (nextName ? `Gate to ${nextName}` : "Holding the lead") : "Upcoming gate";
                return (
                  <div style={{ padding: "18px 14px 20px", borderTop: "1px solid #f1eef6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, color: R_PURPLE, textTransform: "uppercase", letterSpacing: ".08em" }}>{vName} milestones</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: vDone === vMedals.length ? R_GREEN : R_PINK, background: vDone === vMedals.length ? "#e2f0ec" : "#fbe9f1", padding: "2px 9px", borderRadius: 999 }}>{vDone}/{vMedals.length} hit</span>
                      <div style={{ flex: 1, height: 1, background: "#e4ddee" }} />
                      <span style={{ fontSize: 10.5, color: "#9a93a8", fontWeight: 600 }}>{rel} · hover a badge for detail</span>
                    </div>
                    {/* coins align to the rail — same 200px / 5×1fr / 132px grid */}
                    <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${N}, 1fr) 132px` }}>
                      <div style={{ gridColumn: `2 / span ${N}`, display: "grid", gridTemplateColumns: `repeat(${N}, 1fr)` }}>
                        {vMedals.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: "center" }}><RMedal m={m} stageKey={vKey} /></div>)}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- The Growth Engine (program quarters) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function qInfo(quarterStart) {
  const d = new Date(`${quarterStart}T00:00:00`);
  const m = d.getMonth(), y = d.getFullYear();
  const end = new Date(y, m + 3, 0);
  return { start: d, end, qNum: Math.floor(m / 3) + 1, range: `${MONTHS[m]} – ${MONTHS[(m + 2) % 12]} ${y}` };
}
const STATE_META = {
  done: { label: "Complete", color: R_GREEN, bg: "#e2f0ec" },
  now: { label: "In progress", color: R_PINK, bg: "#fbe2eb" },
  next: { label: "Up next", color: R_PURPLE, bg: "#ece8f1" },
};

// Merge synced quarters with a continuous calendar sequence, padding ~2 quarters
// past the current one (empty "Up next" cards) so the active quarter isn't stuck
// at the right edge. Gaps between synced quarters are filled too.
function buildQuarters(synced, now) {
  const sorted = synced.slice().sort((a, b) => String(a.quarterStart).localeCompare(String(b.quarterStart)));
  const byKey = {};
  sorted.forEach((q) => { const d = new Date(`${q.quarterStart}T00:00:00`); byKey[`${d.getFullYear()}-${d.getMonth()}`] = q; });
  const curStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const targetEnd = new Date(curStart.getFullYear(), curStart.getMonth() + 6, 1); // current + 2 quarters
  const first = sorted.length ? new Date(`${sorted[0].quarterStart}T00:00:00`) : curStart;
  const lastSynced = sorted.length ? new Date(`${sorted[sorted.length - 1].quarterStart}T00:00:00`) : curStart;
  const end = lastSynced > targetEnd ? lastSynced : targetEnd;
  const out = [];
  for (let d = new Date(first); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 3, 1)) {
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (byKey[k]) out.push(byKey[k]);
    else out.push({ id: `syn-${k}`, label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`, quarterStart: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, proof: null, playbookUrl: null, reportUrl: null });
  }
  return out;
}
function EngineChip({ engine }) {
  const e = ENGINES[engine]; if (!e) return null;
  return <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "2px 7px", borderRadius: 5, background: `${e.color}1a`, color: e.color, whiteSpace: "nowrap" }}>{e.label}</span>;
}

function QuarterCard({ q, projects, now, openDoc }) {
  const { end, qNum, range } = qInfo(q.quarterStart);
  const start = new Date(`${q.quarterStart}T00:00:00`);
  const state = now > end ? "done" : now >= start ? "now" : "next";
  const upcoming = state === "next";
  const sm = STATE_META[state];
  const blurStyle = upcoming ? { filter: "blur(3px) grayscale(0.4)", opacity: 0.4, pointerEvents: "none" } : null;
  const inits = projects.filter((p) => { if (!p.dueDate) return false; const dd = new Date(`${p.dueDate}T00:00:00`); return dd >= start && dd <= end; });
  const done = inits.filter((p) => p.status === "live").length;
  const pct = inits.length ? Math.round((done / inits.length) * 100) : 0;
  const barColor = state === "done" ? R_GREEN : state === "now" ? R_PINK : "#b9a6d4";
  const engines = [...new Set(inits.flatMap((p) => enginesOf(p)))].filter((e) => ENGINES[e]).sort((a, b) => ENGINE_ORDER.indexOf(a) - ENGINE_ORDER.indexOf(b));
  const nodeBg = state === "done" ? R_GREEN : state === "now" ? R_PINK : "rgba(255,255,255,0.12)";
  const links = [q.playbookUrl && { kind: "Playbook", url: q.playbookUrl, primary: state === "now" }, q.reportUrl && { kind: "Report", url: q.reportUrl, primary: false }].filter(Boolean);
  return (
    <div style={{ minWidth: 248, flex: "1 1 248px", display: "flex", flexDirection: "column" }}>
      {/* drive-line node — line extends ±9px past the card to bridge the 18px
          gap into a continuous rail; done = green, current = green→dim split at
          the node, upcoming = dim. */}
      <div style={{ position: "relative", height: 34, marginBottom: 18 }}>
        <span style={{ position: "absolute", top: 15, left: -9, right: -9, height: 4, borderRadius: 999, background: state === "done" ? "rgba(44,125,104,0.6)" : state === "now" ? "linear-gradient(90deg, rgba(44,125,104,0.6) 50%, rgba(255,255,255,0.14) 50%)" : "rgba(255,255,255,0.14)" }} />
        <span style={{ position: "absolute", left: "50%", top: 1, transform: "translateX(-50%)", width: 32, height: 32, borderRadius: 999, background: nodeBg, border: `3px solid ${state === "next" ? "rgba(255,255,255,0.28)" : "#2c1444"}`, boxShadow: state === "now" ? "0 0 0 5px rgba(217,53,110,0.3)" : "none", color: "#fff", display: "grid", placeItems: "center", zIndex: 1 }}>
          {state === "done" ? <RIc.check s={14} /> : state === "now" ? <RDot c="#fff" size={7} /> : <RDot c="rgba(255,255,255,0.5)" size={6} />}
        </span>
      </div>
      {/* card */}
      <div style={{ background: "#fff", border: `1px solid ${state === "now" ? R_PINK : "#ece8f1"}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, boxShadow: state === "now" ? "0 10px 26px rgba(217,53,110,0.16)" : "0 2px 8px rgba(56,28,79,0.06)" }}>
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #f1eef6" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: state === "now" ? R_PINK : R_PURPLE, letterSpacing: "-0.02em" }}>Q{qNum}</span>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "3px 9px", borderRadius: 999, background: sm.bg, color: sm.color, whiteSpace: "nowrap" }}>{sm.label}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "#a8a0b5", fontWeight: 600, marginTop: 4 }}>{range}</div>
          <div style={{ fontSize: 11.5, color: "#7a7388", lineHeight: 1.4, marginTop: 8, minHeight: 48 }}>{q.proof || (state === "next" ? "" : "Results recap posts at the quarterly review.")}</div>
        </div>
        {/* body + footer — grayed/blurred behind an "Up next" overlay for future quarters */}
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13, flex: 1, ...blurStyle }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: R_PURPLE, lineHeight: 1 }}>{inits.length}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#7a7388" }}>key initiative{inits.length === 1 ? "" : "s"}</span>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8395" }}>{inits.length ? `${done} of ${inits.length} delivered` : "Not started"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: barColor }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: "#ece8f1", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 999 }} /></div>
            </div>
            {engines.length ? (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".09em", color: "#a8a0b5", marginBottom: 7 }}>Engines in play</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{engines.map((e) => <EngineChip key={e} engine={e} />)}</div>
              </div>
            ) : null}
          </div>
          {links.length ? (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #f1eef6", display: "flex", flexDirection: "column", gap: 7, background: "#faf8fc", ...blurStyle }}>
              {links.map((l) => (
                <button key={l.kind} onClick={() => openDoc(l.url, `Q${qNum} ${l.kind} · ${range}`)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", width: "100%", padding: "9px 11px", borderRadius: 9, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11.5, border: l.primary ? "none" : "1px solid #e6e0ee", background: l.primary ? R_PINK : "#fff", color: l.primary ? "#fff" : R_PURPLE, boxShadow: l.primary ? "0 5px 13px rgba(217,53,110,0.26)" : "none" }}>
                  <span style={{ flex: 1, textAlign: "left" }}>{l.kind}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          ) : null}
          {upcoming ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 16 }}>
              <div>
                <div style={{ width: 34, height: 34, borderRadius: 999, background: "#f1edf6", color: "#9a8fb0", display: "grid", placeItems: "center", margin: "0 auto 8px" }}><RIc.lock s={16} /></div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, color: R_PURPLE }}>Up next</div>
                <div style={{ fontSize: 11, color: "#8a8395", fontWeight: 600, marginTop: 3 }}>Plan locks at kickoff</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EngineCard({ quarters, openDoc }) {
  const projects = DATA.projects || [];
  const now = new Date();
  const merged = quarters.length ? buildQuarters(quarters, now) : [];
  const rowRef = React.useRef(null);
  const nowIndex = merged.findIndex((q) => { const { start, end } = qInfo(q.quarterStart); return now >= start && now <= end; });
  React.useEffect(() => {
    const row = rowRef.current; if (!row) return;
    const el = row.children[nowIndex < 0 ? 0 : nowIndex];
    if (el) row.scrollLeft = Math.max(0, el.offsetLeft - (row.clientWidth - el.clientWidth) / 2);
  }, [nowIndex, merged.length]);
  if (!merged.length) return null;
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #381c4f 0%, #290d41 72%)", borderRadius: 16, padding: "24px 26px 28px", boxShadow: "0 16px 40px rgba(56,28,79,0.26)" }}>
      <div style={{ position: "absolute", right: -70, top: -80, width: 250, height: 250, borderRadius: 999, background: "radial-gradient(circle, rgba(217,53,110,0.30), transparent 68%)" }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 5 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,216,128,0.16)", color: R_YELLOW, display: "grid", placeItems: "center", flexShrink: 0 }}><RIc.bolt s={19} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: R_YELLOW, marginBottom: 3 }}>The growth engine</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>Program roadmap · the 90-day cycle</div>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: ".04em", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", padding: "6px 13px", borderRadius: 999, whiteSpace: "nowrap" }}>Plan · Build · Prove</span>
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)", fontWeight: 600, marginBottom: 14, paddingLeft: 48 }}>The always-on Core powering every market — Proposal system · Review engine · Board surveys</div>
        <div ref={rowRef} style={{ display: "flex", gap: 18, alignItems: "stretch", overflowX: "auto", paddingTop: 10, paddingBottom: 6 }}>
          {merged.map((q) => <QuarterCard key={q.id} q={q} projects={projects} now={now} openDoc={openDoc} />)}
        </div>
      </div>
    </div>
  );
}

// add a bolt glyph for the engine icon
RIc.bolt = (p) => <svg width={p.s||16} height={p.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>;

function Lightbox({ doc, onClose }) {
  React.useEffect(() => {
    if (!doc) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [doc, onClose]);
  if (!doc) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(40,13,65,0.55)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", padding: "3vh 3vw" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "94vh", background: "#fff", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(56,28,79,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #ece8f1", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, color: R_PURPLE, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
          <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: R_PINK, textDecoration: "none" }}>Open in new tab ↗</a>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "#f1edf6", color: R_PURPLE, width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>×</button>
        </div>
        <iframe src={doc.url} title={doc.title} style={{ flex: 1, width: "100%", border: "none" }} />
      </div>
    </div>
  );
}

export default function RoadmapScreen() {
  const locations = DATA.locations || [];
  const quarters = DATA.programQuarters || [];
  const [doc, setDoc] = React.useState(null);
  const openDoc = (url, title) => setDoc({ url, title });
  if (!locations.length && !quarters.length) {
    return (
      <div className="content" data-screen-label="Roadmap">
        <div style={{ background: "#fff", border: "1px solid #ece8f1", borderRadius: 16, padding: "44px 26px", textAlign: "center", boxShadow: "0 2px 10px rgba(56,28,79,0.05)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f1edf6", color: R_PURPLE, display: "grid", placeItems: "center", margin: "0 auto 14px" }}><RIc.trend s={22} /></div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: R_PURPLE }}>Your growth roadmap is being set up</div>
          <div style={{ fontSize: 13, color: "#8a8395", fontWeight: 600, marginTop: 6 }}>Your markets and growth stages will appear here shortly.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="content" data-screen-label="Roadmap">
      {locations.length ? <JourneyRail locations={locations} /> : null}
      <EngineCard quarters={quarters} openDoc={openDoc} />
      <Lightbox doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
