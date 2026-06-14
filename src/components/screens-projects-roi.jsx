import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { zdList } from '../lib/zendesk.js';
import { summarizeTickets } from '../lib/summaries.js';
import { ENGINES, enginesOf } from '../lib/engines.js';

// Projects, ROI, Tickets, Playbook, Library, Recognition screens
const { useState: _useState1 } = React;
const useState = _useState1;

const PROJ_STATUSES = [
  { id:"planning",    label:"Planning",    color:"#8a8780", bg:"#f3f0eb" },
  { id:"assigned",    label:"Assigned",    color:"#2a6391", bg:"#e3edf4" },
  { id:"waiting",     label:"Waiting",     color:"#7d5ba6", bg:"#f0e9f7" },
  { id:"in-progress", label:"In-Progress", color:"#b8881a", bg:"#fcefd1" },
  { id:"live",        label:"Complete",    color:"#2c8a6e", bg:"#e6f3f0" },
];
const PROJ_ST = Object.fromEntries(PROJ_STATUSES.map(s=>[s.id, s]));
const PROJ_ENGINES = {
  reach:  { label:"Reach",  color:"#2a6391", bg:"#e3edf4" },
  match:  { label:"Match",  color:"var(--alloy-pink)", bg:"var(--alloy-pink-tint)" },
  retain: { label:"Retain", color:"#2c8a6e", bg:"#e6f3f0" },
};

function ProjStatusPill({ status }) {
  const s = PROJ_ST[status] || PROJ_ST["in-progress"];
  return (
    <span className="proj-status-pill" style={{color:s.color, background:s.bg}}>
      <span className="dot" style={{background:s.color}}/>{s.label}
    </span>
  );
}
function ProjEngineChips({ engines }) {
  return (
    <div className="proj-engines">
      {(engines || []).map(eid => {
        const e = PROJ_ENGINES[eid]; if (!e) return null;
        return <span key={eid} className="proj-engine-chip" style={{color:e.color, background:e.bg}}>{e.label}</span>;
      })}
    </div>
  );
}

// ---- Projects redesign atoms ----
const CAT_COLORS = ["#2a6391", "#c12a60", "#2c7d68", "#b8881a", "#381c4f", "#5a7d9a", "#9a6f3a"];
function catColor(name) {
  let h = 0; const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}
function CatChip({ name }) {
  if (!name) return null;
  const c = catColor(name);
  return <span className="pj-cat-chip" style={{ color: c, background: `${c}1a` }}>{name}</span>;
}
// Growth engine(s) a project serves — the strategic layer above its discipline.
// Real Monday tags win, else the category→engine map (see lib/engines.js).
function EngineChips({ project }) {
  const list = enginesOf(project);
  if (!list.length) return null;
  return (
    <>
      {list.map((e) => (
        <span key={e} className="pj-engine-chip" style={{ color: ENGINES[e].color, background: `${ENGINES[e].color}1a` }}>{ENGINES[e].label}</span>
      ))}
    </>
  );
}
function PjBar({ value, color }) {
  return <div className="pj-bar"><span className="pj-bar-fill" style={{ width: `${value || 0}%`, background: color }} /></div>;
}
function PjAvatars({ ids }) {
  return (
    <div className="pj-avatars">
      {(ids || []).slice(0, 4).map((id, i) => (
        <span key={i} className="pj-avatar" style={{ background: catColor(id), marginLeft: i === 0 ? 0 : -8 }}>{id}</span>
      ))}
    </div>
  );
}
// "Waiting on you" mark — an hourglass (waiting / paused on you).
const WaitingIcon = ({ width = 18, height = 18 }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" />
  </svg>
);

// "In progress" mark — a loading ring (faint full circle + a leading arc).
const InProgressIcon = ({ width = 18, height = 18 }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" opacity="0.35" />
    <path d="M12 3a9 9 0 0 1 9 9" />
  </svg>
);

// `tone` is the zone's accent color; the chip + count pill derive a glassy
// treatment from it (translucent gradient, colored border, soft glow).
function SecHead({ icon, tone, title, sub, count }) {
  return (
    <div className="pj-sec" style={{ "--tone": tone }}>
      <span className="pj-sec-ic">{icon}</span>
      <div className="pj-sec-titles">
        <div className="pj-sec-title">{title}</div>
        {sub ? <div className="pj-sec-sub">{sub}</div> : null}
      </div>
      {count != null ? <span className="pj-sec-count">{count}</span> : null}
    </div>
  );
}
// Who opened the ticket — names the requester so multiple openers are clear.
// Alloy-raised tickets (requester @alloygp.co) collapse to just "Alloy opened".
function OpenedBy({ t }) {
  const alloy = String(t.requesterEmail || "").toLowerCase().endsWith("@alloygp.co");
  const first = String(t.requester || "").trim().split(" ")[0];
  const label = alloy ? "Alloy opened" : (first ? `${first} opened` : "Client opened");
  return <span className={`pj-openedby ${alloy ? "we" : "you"}`}>{label}</span>;
}

// Zone 3 status groups — every non-ticket project, bucketed + collapsible.
const PJ_GROUPS = [
  { id: "in-progress", label: "In progress", color: "#f3bf72", statuses: ["in-progress", "assigned", "waiting"] },
  { id: "planning", label: "Planning", color: "#84aef7", statuses: ["planning"] },
  { id: "live", label: "Complete", color: "#2c7d68", statuses: ["live"] },
];

function ProjectsScreen({ onNav, onCompose }) {
  // Zones 1 & 2 are Zendesk tickets: pending = waiting on you, open = we're on it.
  const [tickets, setTickets] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    zdList().then((r) => { if (!cancelled) setTickets((r && r.tickets) || []); }).catch(() => { if (!cancelled) setTickets([]); });
    return () => { cancelled = true; };
  }, []);
  const loading = tickets === null; // zdList still in flight
  const all = tickets || [];
  const pending = all.filter((t) => t.status === "pending");
  const openTix = all.filter((t) => t.status === "open");

  // AI one-line summaries for the "Waiting on you" cards. Seed from the cache
  // loaded with the page, then refresh/generate via `summarize-tickets` once
  // the live ticket list is in (it re-runs the model only for tickets that
  // updated since last summarized, so this stays cheap).
  const [summaries, setSummaries] = React.useState(() => DATA.ticketSummaries || {});
  const [counts, setCounts] = React.useState(() => DATA.ticketCounts || {});
  const pendingIdsKey = pending.map((t) => t.id).join(",");
  React.useEffect(() => {
    if (!pendingIdsKey) return;
    let cancelled = false;
    summarizeTickets(pendingIdsKey.split(",")).then((r) => {
      if (cancelled || !r) return;
      if (r.summaries && Object.keys(r.summaries).length) setSummaries((prev) => ({ ...prev, ...r.summaries }));
      if (r.counts && Object.keys(r.counts).length) setCounts((prev) => ({ ...prev, ...r.counts }));
    });
    return () => { cancelled = true; };
  }, [pendingIdsKey]);
  const links = DATA.ticketLinks || {};
  const progress = DATA.ticketProgress || {}; // zendesk id → subtask-% (stages)
  const stageColor = () => "#2c7d68"; // green for all stage-progress bars

  const projects = DATA.projects || [];
  // In motion now = active tickets (waiting-on-you + we're-on-it) + everything
  // we're driving, minus complete.
  const inMotion = pending.length + openTix.length + projects.filter((p) => p.status !== "live").length;
  const _now = new Date();
  const _qStart = new Date(_now.getFullYear(), Math.floor(_now.getMonth() / 3) * 3, 1);
  const _qEnd = new Date(_qStart.getFullYear(), _qStart.getMonth() + 3, 1);
  const inQuarter = (d) => { if (!d) return false; const x = new Date(d); return x >= _qStart && x < _qEnd; };
  const _today0 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
  // Past-due: a due date before today on work that isn't already complete.
  const isOverdue = (p) => p.status !== "live" && p.dueDate && new Date(`${p.dueDate}T00:00:00`) < _today0;
  const deliveredQtr = projects.filter((p) => p.status === "live" && inQuarter(p.dueDate)).length;
  const totalCompleted = projects.filter((p) => p.status === "live").length;

  const leadsToQualify = (DATA.recentLeads || []).filter((l) => l.quotable !== "yes" && l.quotable !== "no").length;

  const groups = PJ_GROUPS
    .map((g) => ({ ...g, items: projects.filter((p) => g.statuses.includes(p.status)) }))
    .filter((g) => g.items.length);
  const [open, setOpen] = React.useState({ "in-progress": true, planning: true, live: false });

  const reqProject = () => { if (onCompose) onCompose(); else onNav("tickets"); };

  return (
    <div className="content pj-screen" data-screen-label="02 Playbook">
      {/* Purple metrics bar (replaces a page title — the app top bar has that) */}
      <div className="pj-metrics">
        <div className="pj-metric"><span className="pj-metric-n">{inMotion}</span><span className="pj-metric-l">in motion now</span></div>
        <div className="pj-metric"><span className="pj-metric-n" style={{ color: "#2c8a6e" }}>{deliveredQtr}</span><span className="pj-metric-l">delivered this quarter</span></div>
        <div className="pj-metric"><span className="pj-metric-n" style={{ color: "#2c8a6e" }}>{totalCompleted}</span><span className="pj-metric-l">total projects completed</span></div>
      </div>

      {/* ===== 1 · Waiting on you ===== */}
      <SecHead icon={<WaitingIcon width={18} height={18} />} tone="#b8881a"
        title="Waiting on you" sub="Paused on you — each one moves forward the moment you weigh in"
        count={loading ? null : pending.length + (leadsToQualify > 0 ? 1 : 0)} />
      <div className="pj-cards">
        {loading ? [0, 1, 2, 3].map((i) => (
          <div key={`sk${i}`} className="pj-card skel" aria-hidden="true">
            <div className="pj-skel-line w40" /><div className="pj-skel-line w90" /><div className="pj-skel-line w70" />
            <div className="pj-skel-btns"><span /><span /></div>
          </div>
        )) : pending.map((t) => (
          <div key={t.id} className="pj-card pj-clickable" role="button" tabIndex={0} onClick={() => onNav("tickets", t.id)}>
            {t.requester ? (
              <div className="pj-card-req head">
                <span className="pj-req-av" style={{ background: catColor(t.requester) }}>{t.requester.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}</span>
                <span className="pj-req-name">Requested by <strong>{t.requester}</strong></span>
                {counts[t.id] != null ? (
                  <span className="pj-req-count" title={`${counts[t.id]} messages`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>
                    {counts[t.id]}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="pj-card-title">{t.title}</div>
            {summaries[t.id] ? (
              <div className="pj-summary"><I.Sparkle width={12} height={12} /><span>{summaries[t.id]}</span></div>
            ) : null}
            {progress[t.id] != null ? (
              <div className="pj-card-prog"><PjBar value={progress[t.id]} color={stageColor(progress[t.id])} /><span className="pj-pct">{progress[t.id]}%</span></div>
            ) : null}
            <div className="pj-cta">
              {links[t.id] ? <a className="pj-btn-primary" href={links[t.id]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Review Now <I.External width={12} height={12} /></a> : null}
              <span className={`pj-card-msg${links[t.id] ? "" : " solo"}`}>Open message <I.Arrow width={13} height={13} /></span>
            </div>
          </div>
        ))}
        {!loading && leadsToQualify > 0 ? (
          <div className="pj-card lead pj-clickable" role="button" tabIndex={0} onClick={() => onNav("leads")}>
            <div className="pj-card-top">
              <span className="pj-leadtag">Leads</span>
              <span className="pj-due lead"><I.Clock width={11} height={11} /> new today</span>
            </div>
            <div className="pj-lead-hero">
              <div className="pj-lead-num">{leadsToQualify}</div>
              <div className="pj-lead-sub">new {leadsToQualify === 1 ? "lead" : "leads"} to qualify</div>
            </div>
            <div className="pj-cta"><span className="pj-card-msg solo lead">Qualify leads <I.Arrow width={14} height={14} /></span></div>
          </div>
        ) : null}
        {tickets !== null && pending.length === 0 && leadsToQualify === 0 ? (
          <div className="pj-empty">Nothing waiting on you — you're all caught up.</div>
        ) : null}
      </div>

      {/* ===== 2 · In progress · we're on it ===== */}
      {(loading || openTix.length > 0) ? (
        <>
          <SecHead icon={<InProgressIcon width={18} height={18} />} tone="#b8881a"
            title="In progress · we're on it" sub="Open with your team — no action needed, we'll reach out when we need you"
            count={loading ? null : openTix.length} />
          <div className="pj-list">
            {loading ? [0, 1].map((i) => (
              <div key={`skr${i}`} className="pj-row skel" aria-hidden="true"><div className="pj-skel-line w60" style={{ margin: 0 }} /></div>
            )) : openTix.map((t) => (
              <div key={t.id} className="pj-row pj-clickable" role="button" tabIndex={0} onClick={() => onNav("tickets", t.id)}>
                <div className="pj-row-title">{t.title}</div>
                <OpenedBy t={t} />
                {progress[t.id] != null ? (
                  <div className="pj-row-prog"><PjBar value={progress[t.id]} color={stageColor(progress[t.id])} /><span className="pj-pct">{progress[t.id]}%</span></div>
                ) : null}
                <span className="pj-view">View <I.Arrow width={13} height={13} /></span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ===== 3 · Everything else we're driving ===== */}
      <SecHead icon={<I.Bolt width={16} height={16} />} tone="#b8881a"
        title="Everything else we're driving" sub="Work we're running for you in the background — nothing needed from you"
        count={projects.length} />
      <div className="pj-groups">
        {groups.map((g) => {
          const isOpen = open[g.id];
          return (
            <div key={g.id} className="pj-group" style={{ "--g": g.color }}>
              <button className={`pj-group-head${g.id === "live" ? " done" : ""}`} onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                <span className={`pj-chev${isOpen ? " open" : ""}`}><I.Chevron width={15} height={15} /></span>
                <span className="pj-dot" />
                <span className="pj-group-label">{g.label}</span>
                <span className="pj-group-count">{g.items.length}</span>
                <div className="grow" />
                {g.id === "live" ? <span className="pj-done-note"><I.Check width={13} height={13} /> Delivered &amp; live</span> : null}
              </button>
              {isOpen ? (
                <div className="pj-prows">
                  {g.items.map((p) => (
                    <div key={p.id} className="pj-prow">
                      <div className="pj-prow-title">{p.title}</div>
                      <div className="pj-prow-cat"><EngineChips project={p} /><CatChip name={p.phase} /></div>
                      <div className="pj-prow-owners"><PjAvatars ids={p.owners} /></div>
                      <div className={`pj-prow-due${isOverdue(p) ? " overdue" : ""}`}><div className="d">{p.due}</div><div className="dr">{p.dueRel}</div></div>
                      <div className="pj-prow-prog">
                        <PjBar value={p.pct} color="#2c7d68" />
                        <span className="pj-pct">{p.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button className="pj-footer-cta" onClick={reqProject}><I.Plus width={15} height={15} /> Request a new project</button>
    </div>
  );
}

function ProjectCard({ p }) {
  const statusMap = {
    "in-progress": { label: "On track", c: "#2c8a6e", bg: "rgba(44,138,110,0.1)" },
    "waiting":     { label: "Waiting",  c: "#7d5ba6", bg: "rgba(125,91,166,0.12)" },
    "review":      { label: "For you",  c: "var(--alloy-pink)", bg: "var(--alloy-pink-tint)" },
    "live":        { label: "Shipped",  c: "#2a6391", bg: "var(--alloy-blue-tint)" },
    "blocked":     { label: "Blocked",  c: "#b03a3a", bg: "#fde0e0" },
  };
  const s = statusMap[p.status] || statusMap["in-progress"];
  const phaseColor = {
    "BoardReach": "var(--alloy-pink)",
    "BoardMatch": "#2a6391",
    "BoardRetain": "#2c8a6e",
    "L&D": "#b8881a",
  }[p.phase] || "var(--alloy-purple)";
  const barColor = p.status === "live" ? "#2a6391" : p.status === "blocked" ? "#b03a3a" : p.status === "review" ? "var(--alloy-pink)" : p.status === "waiting" ? "#7d5ba6" : "#2c8a6e";

  return (
    <div className="proj-card">
      <div className="proj-card-head">
        <span className="phase-pill" style={{color: phaseColor, background: `${phaseColor}14`}}>{p.phase}</span>
        <span className="status-pill" style={{color: s.c, background: s.bg}}>
          <span className="dot" style={{background: s.c}}/>{s.label}
        </span>
      </div>
      <div className="proj-card-title">{p.title}</div>
      <div className="proj-card-meta">
        <span style={{fontFamily:"var(--font-mono)"}}>{p.id}</span>
        <span className="sep">·</span>
        <span>Due {p.due}</span>
        <span className="sep">·</span>
        <span style={{color: p.status === "review" ? "var(--alloy-pink)" : "inherit", fontWeight: p.status === "review" ? 700 : 500}}>{p.dueRel}</span>
      </div>
      <div className="proj-bar">
        <div className="proj-bar-track">
          <div className="proj-bar-fill" style={{width:`${p.pct}%`, background: barColor}}/>
        </div>
        <div className="proj-bar-pct">{p.pct}%</div>
      </div>
      <div className="proj-card-foot">
        <div className="avs">
          {p.owners.map((o, i) => (<div key={i} className="av" style={{background: ["var(--alloy-purple)","var(--alloy-pink)","#2a6391"][i%3]}}>{o}</div>))}
        </div>
        <span className="pulse">{p.pulse}</span>
      </div>
    </div>
  );
}

function Donut({ segments }) {
  const total = segments.reduce((s, x) => s + x.v, 0);
  const r = 56; const c = 2*Math.PI*r;
  let off = 0;
  return (
    <svg viewBox="0 0 130 130" width="130" height="130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--alloy-light-gray)" strokeWidth="14"/>
      {segments.map((s, i) => {
        const len = (s.v/total)*c;
        const dash = `${len} ${c-len}`;
        const dashOff = -off;
        off += len;
        return <circle key={i} cx="65" cy="65" r={r} fill="none" stroke={s.c} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={dashOff} transform="rotate(-90 65 65)"/>
      })}
    </svg>
  );
}

function LegendRow({ c, name, v }) {
  return (
    <div className="legend-row">
      <span className="swatch" style={{background:c}}/>
      <span className="lname">{name}</span>
      <span className="lval">{v}</span>
    </div>
  );
}

// =================== ROI ===================
function ROIScreen() {
  const r = DATA.roi;
  return (
    <div className="content" data-screen-label="03 ROI">
      <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:14, flexWrap:"wrap"}}>
        <h2 style={{fontFamily:"var(--font-display)", fontSize:"clamp(22px, 5vw, 28px)", fontWeight:800, color:"var(--alloy-purple)", margin:0, letterSpacing:"-0.01em"}}>ROI &amp; Insight</h2>
        <div style={{marginLeft:"auto", display:"flex", gap:8}}>
          <select className="input" style={{width:160, fontWeight:600}}><option>Last 12 months</option><option>This quarter</option><option>YTD 2026</option><option>All time</option></select>
          <button className="btn btn-secondary"><I.Doc width={13} height={13}/> Export to board</button>
        </div>
      </div>

      {/* ROI hero */}
      <div className="hero-band" style={{background:"linear-gradient(115deg, var(--alloy-purple) 0%, #1f0e30 60%, #0f061a 100%)", marginBottom: 20}}>
        <div className="greet">7.3× return on investment</div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 32, alignItems: "end", position:"relative", zIndex:1}}>
          <div>
            <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize: "clamp(36px, 6vw, 56px)", color:"#fff", lineHeight: 1, letterSpacing:"-0.02em"}}>${(r.contractValue/1000).toFixed(0)}K</div>
            <div style={{fontSize:13, color:"rgba(255,255,255,0.7)", marginTop:8, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em"}}>Contract value won</div>
            <div style={{fontSize:12, color:"var(--alloy-yellow)", marginTop:4}}>{r.boardsSigned} signed boards · attributed to Alloy</div>
          </div>
          <div>
            <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize: "clamp(36px, 6vw, 56px)", color:"#fff", lineHeight: 1, letterSpacing:"-0.02em", opacity:0.65}}>${(r.invested/1000).toFixed(0)}K</div>
            <div style={{fontSize:13, color:"rgba(255,255,255,0.7)", marginTop:8, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em"}}>Invested with Alloy</div>
            <div style={{fontSize:12, color:"rgba(255,255,255,0.5)", marginTop:4}}>BoardSuite Accelerate · Q1–Q4</div>
          </div>
          <div>
            <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize: "clamp(36px, 6vw, 56px)", color:"var(--alloy-yellow)", lineHeight: 1, letterSpacing:"-0.02em"}}>{r.ratio}×</div>
            <div style={{fontSize:13, color:"rgba(255,255,255,0.7)", marginTop:8, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em"}}>Investment ratio</div>
            <div style={{fontSize:12, color:"var(--alloy-yellow)", marginTop:4}}>Industry benchmark: 3.1×</div>
          </div>
        </div>
        <div style={{marginTop: 26, position:"relative", zIndex:1}}>
          <ROIBarChart invested={r.invested} contractValue={r.contractValue} />
        </div>
      </div>

      {/* Funnel + leads + rankings */}
      <div className="col-2" style={{marginBottom:20}}>
        <div className="card card-pad-lg">
          <div className="card-head"><span className="kicker">From visit to contract</span><h3>Growth funnel</h3></div>
          <FunnelChart />
        </div>
        <div className="card card-pad-lg">
          <div className="card-head"><span className="kicker">Where wins come from</span><h3>Source attribution</h3></div>
          <div style={{display:"flex", alignItems:"center", gap:22, marginTop: 4}}>
            <div className="donut">
              <Donut segments={[{v:4, c:"var(--alloy-pink)"},{v:3, c:"var(--alloy-yellow)"},{v:1, c:"var(--alloy-blue)"},{v:1, c:"var(--alloy-green)"}]} />
              <div className="lbl"><div><div className="v">9</div><div className="t">Boards</div></div></div>
            </div>
            <div className="legend">
              <LegendRow c="var(--alloy-pink)" name="Groundwork (BD)" v="4"/>
              <LegendRow c="var(--alloy-yellow)" name="Organic search" v="3"/>
              <LegendRow c="var(--alloy-blue)" name="Google Ads" v="1"/>
              <LegendRow c="var(--alloy-green)" name="GBP / referral" v="1"/>
            </div>
          </div>
        </div>
      </div>

      {/* Visibility growth */}
      <div className="card card-pad-lg" style={{marginBottom: 20}}>
        <div className="card-head">
          <span className="kicker">Authority is compounding</span>
          <h3>Local rankings &amp; visibility</h3>
          <div className="grow"/>
          <span className="tag tag-status-live"><span className="dot"/>+12 keywords this month</span>
        </div>
        <RankingsChart />
        <div className="col-3" style={{marginTop: 18, gap:10}}>
          <RankingCell label="Tracked keywords" value={r.rankingsTracked} delta="+8"/>
          <RankingCell label="Top-10 positions" value={r.rankingsTop10} delta="+12" tone="green"/>
          <RankingCell label="Top-3 positions" value={18} delta="+5" tone="pink"/>
        </div>
      </div>
    </div>
  );
}

function ROIBarChart({ invested, contractValue }) {
  const max = Math.max(invested, contractValue);
  return (
    <div style={{display:"grid", gridTemplateColumns:"100px 1fr 90px", gap: 14, alignItems:"center", fontSize:13}}>
      <div style={{color:"rgba(255,255,255,0.6)", fontWeight:600, textTransform:"uppercase", fontSize:11, letterSpacing:".08em"}}>Invested</div>
      <div style={{height: 14, background:"rgba(255,255,255,0.08)", borderRadius: 999, position:"relative", overflow:"hidden"}}>
        <div style={{height:"100%", width: `${invested/max*100}%`, background: "rgba(255,255,255,0.55)", borderRadius:999}}/>
      </div>
      <div style={{color:"rgba(255,255,255,0.85)", fontWeight:700}}>${(invested/1000).toFixed(0)}K</div>

      <div style={{color:"var(--alloy-yellow)", fontWeight:700, textTransform:"uppercase", fontSize:11, letterSpacing:".08em"}}>Returned</div>
      <div style={{height: 14, background:"rgba(255,255,255,0.08)", borderRadius: 999, position:"relative", overflow:"hidden"}}>
        <div style={{height:"100%", width: `${contractValue/max*100}%`, background: "linear-gradient(90deg, var(--alloy-pink) 0%, var(--alloy-yellow) 100%)", borderRadius:999, boxShadow:"0 0 24px rgba(245,216,128,0.4)"}}/>
      </div>
      <div style={{color:"#fff", fontWeight:800, fontSize:15}}>${(contractValue/1000).toFixed(0)}K</div>
    </div>
  );
}

function FunnelChart() {
  const stages = [
    { label: "Site sessions", v: 12480, w: 100, c: "var(--alloy-purple)" },
    { label: "Engaged visitors", v: 4200, w: 65, c: "#604a74" },
    { label: "Calls + form leads", v: 412, w: 38, c: "var(--alloy-pink)" },
    { label: "Qualified opportunities", v: 87, w: 22, c: "#c12a60" },
    { label: "Proposals delivered", v: 24, w: 12, c: "var(--alloy-yellow)", textC: "#7a5a14" },
    { label: "Boards signed", v: 9, w: 7, c: "linear-gradient(90deg, var(--alloy-pink), var(--alloy-yellow))", textC: "#fff" },
  ];
  return (
    <div style={{display:"flex", flexDirection:"column", gap: 8, marginTop: 4}}>
      {stages.map((s, i) => (
        <div key={i} style={{display:"grid", gridTemplateColumns: "180px 1fr 80px", gap: 14, alignItems:"center"}}>
          <div style={{fontSize:12.5, color:"var(--fg-3)", fontWeight:600}}>{s.label}</div>
          <div style={{height: 28, position:"relative"}}>
            <div style={{height:"100%", width:`${s.w}%`, background: s.c, borderRadius: 6, display:"flex", alignItems:"center", paddingLeft: 10, color: s.textC || "#fff", fontFamily:"var(--font-display)", fontWeight: 800, fontSize: 13}}>{s.v.toLocaleString()}</div>
          </div>
          <div style={{fontSize:11, color:"var(--fg-muted)", fontWeight:600}}>{i>0 ? `${(s.v/stages[i-1].v*100).toFixed(1)}%` : "—"}</div>
        </div>
      ))}
    </div>
  );
}

function RankingsChart() {
  // sparkline area chart
  const points = [22, 24, 26, 25, 28, 31, 33, 35, 38, 40, 44, 47];
  const top3 = [6, 7, 8, 8, 10, 11, 12, 13, 14, 15, 17, 18];
  const max = 50;
  const w = 800, h = 180;
  const stepX = w / (points.length - 1);
  const xy = (arr) => arr.map((v, i) => `${i*stepX},${h - (v/max*h)}`).join(" ");
  const area = (arr) => `0,${h} ${xy(arr)} ${w},${h}`;
  const months = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  return (
    <div style={{position:"relative", paddingBottom: 24}}>
      <svg viewBox={`0 0 ${w} ${h+30}`} width="100%" preserveAspectRatio="none" style={{display:"block"}}>
        <defs>
          <linearGradient id="rg-pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9356e" stopOpacity="0.35"/><stop offset="100%" stopColor="#d9356e" stopOpacity="0"/></linearGradient>
          <linearGradient id="rg-purple" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#381c4f" stopOpacity="0.18"/><stop offset="100%" stopColor="#381c4f" stopOpacity="0"/></linearGradient>
        </defs>
        {/* gridlines */}
        {[0,0.25,0.5,0.75,1].map(g => <line key={g} x1="0" x2={w} y1={h*g} y2={h*g} stroke="#e8e4ef" strokeWidth="1"/>)}
        <polygon points={area(points)} fill="url(#rg-purple)"/>
        <polyline points={xy(points)} fill="none" stroke="#381c4f" strokeWidth="2.5" strokeLinejoin="round"/>
        <polygon points={area(top3)} fill="url(#rg-pink)"/>
        <polyline points={xy(top3)} fill="none" stroke="#d9356e" strokeWidth="2.5" strokeLinejoin="round"/>
        {/* end markers */}
        <circle cx={(points.length-1)*stepX} cy={h - points[points.length-1]/max*h} r="5" fill="#381c4f" stroke="#fff" strokeWidth="2"/>
        <circle cx={(top3.length-1)*stepX} cy={h - top3[top3.length-1]/max*h} r="5" fill="#d9356e" stroke="#fff" strokeWidth="2"/>
        {/* month labels */}
        {months.map((m, i) => <text key={i} x={i*stepX} y={h+18} fontSize="10" fill="#8a8395" textAnchor={i===0?"start":i===months.length-1?"end":"middle"} fontWeight="600">{m}</text>)}
      </svg>
      <div style={{display:"flex", gap:18, marginTop:6, fontSize:12}}>
        <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{width:10, height:10, borderRadius:3, background:"#381c4f"}}/><span style={{color:"var(--fg-3)", fontWeight:600}}>Top-10 keywords</span></div>
        <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{width:10, height:10, borderRadius:3, background:"#d9356e"}}/><span style={{color:"var(--fg-3)", fontWeight:600}}>Top-3 keywords</span></div>
      </div>
    </div>
  );
}

function RankingCell({ label, value, delta, tone = "purple" }) {
  return (
    <div style={{padding:"12px 16px", background:"var(--alloy-off-white)", border:"1px solid var(--border-subtle)", borderRadius:10}}>
      <div style={{fontSize:11, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:".1em", fontWeight:700}}>{label}</div>
      <div style={{display:"flex", alignItems:"baseline", gap:8, marginTop:4}}>
        <div style={{fontFamily:"var(--font-display)", fontSize:24, fontWeight:800, color:"var(--alloy-purple)"}}>{value}</div>
        <div style={{fontSize:12, fontWeight:700, color: tone==="green"?"#2c8a5e":tone==="pink"?"var(--alloy-pink)":"var(--alloy-purple)"}}>{delta}</div>
      </div>
    </div>
  );
}


export { ProjectsScreen, ROIScreen, Donut, LegendRow };
