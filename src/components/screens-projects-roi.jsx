import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { zdList } from '../lib/zendesk.js';
import { summarizeTickets } from '../lib/summaries.js';
import { ENGINES, ENGINE_ORDER, enginesOf } from '../lib/engines.js';
import { quarterStats, inMotionNow, inMotionByEngine, currentQuarter } from '../lib/quarterStats.js';

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
function SecHead({ icon, tone, title, sub, count, countBg, countFg, right }) {
  // The count lives inside the leading box (the number replaces the icon),
  // colored per section. Falls back to the icon when there's no count.
  const showCount = count != null;
  const boxStyle = showCount && countBg ? { background: countBg, color: countFg } : undefined;
  return (
    <div className="pj-sec" style={{ "--tone": tone }}>
      <span className={`pj-sec-ic${showCount ? " num" : ""}`} style={boxStyle}>{showCount ? <span className="pj-sec-numv">{count}</span> : icon}</span>
      <div className="pj-sec-titles">
        <div className="pj-sec-title">{title}</div>
        {sub ? <div className="pj-sec-sub">{sub}</div> : null}
      </div>
      {right ? <div className="pj-sec-right">{right}</div> : null}
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
// Per-row status pill (status now shown on the row, since groups are by origin).
const PJ_STATUS = {
  "in-progress": { label: "In progress", c: "#8a6d1f", bg: "rgba(245,200,90,0.22)" },
  "assigned":    { label: "Assigned",    c: "#2a6391", bg: "rgba(42,99,145,0.12)" },
  "waiting":     { label: "Waiting",     c: "#7d5ba6", bg: "rgba(125,91,166,0.14)" },
  "planning":    { label: "Planning",    c: "#5a6b8c", bg: "rgba(90,107,140,0.14)" },
  "review":      { label: "In review",   c: "#c1356b", bg: "rgba(217,53,110,0.12)" },
  "blocked":     { label: "Blocked",     c: "#b03a3a", bg: "rgba(176,58,58,0.12)" },
  "live":        { label: "Delivered",   c: "#2c8a6e", bg: "rgba(44,138,110,0.12)" },
};
function StatusPill({ status }) {
  const m = PJ_STATUS[status] || PJ_STATUS["in-progress"];
  return <span className="pj-status-pill" style={{ color: m.c, background: m.bg }}><span className="dot" />{m.label}</span>;
}

// Split-bar segment sizing (mirrors the dashboard Quarterly Playbook card):
// flex by count, with a digit-scaled min-width so small counts stay legible.
const segStyle = (n) => ({ flex: n, minWidth: `${n < 10 ? 16 : n < 100 ? 25 : 32}px` });

// Subtask status disc — done (filled green + check), active (amber ring + dot),
// todo (empty ring).
function SubCheck({ state }) {
  return (
    <span className={`sub-check ${state}`} role="img" aria-label={state === "done" ? "done" : state === "active" ? "in progress" : "to do"}>
      {state === "done" ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : null}
    </span>
  );
}

// A Playbook project row + its expandable subtask checklist (Monday subitems).
// Pill is hidden when there are no subtasks; pct bar stays Monday's value.
function ProjRow({ p, isOverdue }) {
  const subs = p.subtasks || [];
  const [open, setOpen] = React.useState(false);
  const doneN = subs.filter((s) => s.state === "done").length;
  return (
    <div className="pj-prow">
      <div className="pj-prow-main">
        <div className="pj-prow-title">{p.title}<span className="pj-prow-eng"><StatusPill status={p.status} />{p.origin !== "planned" ? <span className="pj-added-chip">Added</span> : null}<EngineChips project={p} /></span></div>
        {subs.length ? (
          <button className="sub-chip" aria-expanded={open} aria-label={`${doneN} of ${subs.length} subtasks done`} onClick={() => setOpen((o) => !o)}>
            <span className="mini">{subs.map((s, i) => <i key={i} className={s.state} />)}</span>
            {doneN}/{subs.length} subtasks
            <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        ) : null}
      </div>
      <div className="pj-prow-cat"><CatChip name={p.phase} /></div>
      <div className={`pj-prow-due${isOverdue(p) ? " overdue" : ""}`}><div className="d">{p.due}</div><div className="dr">{p.dueRel}</div></div>
      <div className="pj-prow-prog">
        <PjBar value={p.pct} color="#2c7d68" />
        <span className="pj-pct">{p.pct}%</span>
      </div>
      {subs.length && open ? (
        <div className="pj-subwrap">
          <div className="pj-subwrap-inner">
            {subs.map((s, i) => (
              <div key={i} className="pj-subrow">
                <SubCheck state={s.state} />
                <span className={`sub-label${s.state === "done" ? " done" : ""}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProjectsScreen({ onNav, onCompose, onNewsletter }) {
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
  const [openers, setOpeners] = React.useState({}); // id → opened by Alloy (proactive)
  const pendingIdsKey = pending.map((t) => t.id).join(",");
  React.useEffect(() => {
    if (!pendingIdsKey) return;
    let cancelled = false;
    summarizeTickets(pendingIdsKey.split(",")).then((r) => {
      if (cancelled || !r) return;
      if (r.summaries && Object.keys(r.summaries).length) setSummaries((prev) => ({ ...prev, ...r.summaries }));
      if (r.counts && Object.keys(r.counts).length) setCounts((prev) => ({ ...prev, ...r.counts }));
      if (r.openers && Object.keys(r.openers).length) setOpeners((prev) => ({ ...prev, ...r.openers }));
    });
    return () => { cancelled = true; };
  }, [pendingIdsKey]);
  const links = DATA.ticketLinks || {};
  const progress = DATA.ticketProgress || {}; // zendesk id → subtask-% (stages)
  const stageColor = () => "#2c7d68"; // green for all stage-progress bars

  const projects = DATA.projects || [];
  // Canonical numbers — ONE source of truth (src/lib/quarterStats.js), shared
  // with the dashboard + account page so the counts always agree:
  //   inMotion  = active projects (status-based, all-time)
  //   delivered this quarter = live + due this quarter
  const qs = quarterStats(projects);
  const inMotion = inMotionNow(projects);
  const motionEngines = inMotionByEngine(projects); // breakdown of the same set
  const _now = new Date();
  const _today0 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
  // Past-due: a due date before today on work that isn't already complete.
  const isOverdue = (p) => p.status !== "live" && p.dueDate && new Date(`${p.dueDate}T00:00:00`) < _today0;
  const leadsToQualify = (DATA.recentLeads || []).filter((l) => l.quotable !== "yes" && l.quotable !== "no").length;
  // Open newsletter round → a "waiting on you" card (submit content).
  const nlReq = (onNewsletter && DATA.newsletterRequest && DATA.newsletterRequest.status === "open") ? DATA.newsletterRequest : null;
  const nlExtra = nlReq ? 1 : 0;
  const fmtDue = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return d; } };
  // Skeleton count: the synced tickets snapshot lags live Zendesk, so remember
  // last visit's real "Waiting on you" count per account and render that many
  // placeholders — the grid keeps its shape when the live list resolves.
  const waitCountKey = `pj-wait-count-${DATA.account?.id || "x"}`;
  const skelCount = (() => {
    let cached = 0;
    try { cached = Number(localStorage.getItem(waitCountKey)) || 0; } catch { /* ignore */ }
    if (cached >= 1) return Math.min(4, cached);
    const guess = (DATA.tickets || []).filter((t) => t.status === "pending").length + (leadsToQualify > 0 ? 1 : 0);
    return Math.min(4, Math.max(2, guess));
  })();
  React.useEffect(() => {
    if (loading) return;
    const n = pending.length + (leadsToQualify > 0 ? 1 : 0) + nlExtra;
    try { if (n >= 1) localStorage.setItem(waitCountKey, String(n)); } catch { /* ignore */ }
  }, [loading, pending.length, leadsToQualify, nlExtra, waitCountKey]);

  // Cap the "Completed" group to THIS calendar quarter — older delivered work is
  // history and lives on the Roadmap, so the Playbook stays focused on the now.
  const { start: _qStart, end: _qEnd } = currentQuarter();
  const _inThisQuarter = (p) => {
    const d = p.dueDate ? new Date(`${String(p.dueDate).slice(0, 10)}T00:00:00`) : null;
    return !!d && d >= _qStart && d <= _qEnd;
  };
  // In-motion work is grouped by ORIGIN (Planned vs Added) — status now lives on
  // a per-row pill. Delivered work stays in its own "Completed this quarter"
  // group. These line up with the header's Planned/Added split bars: a bar's
  // motion (pink) segment = the matching group's row count.
  const _isLive = (p) => p.status === "live";
  const groups = [
    { id: "planned", label: "Planned", color: "#84aef7", done: qs.plannedDone, items: projects.filter((p) => !_isLive(p) && p.origin === "planned") },
    { id: "added", label: "Added", color: "#d9356e", done: qs.addedDone, items: projects.filter((p) => !_isLive(p) && p.origin !== "planned") },
    { id: "live", label: "Completed this quarter", color: "#2c7d68", done: null, items: projects.filter((p) => _isLive(p) && _inThisQuarter(p)) },
  ].filter((g) => g.items.length);
  const [open, setOpen] = React.useState({ tickets: true, planned: true, added: true, live: false });

  // ---- Lightweight filter (status / engine / category) over the driving rows.
  // Options are derived from the data so only relevant values show. The filter
  // narrows visible rows only — the header quarter stats stay whole-quarter.
  const [filters, setFilters] = React.useState({ status: "", engine: "", cat: "", origin: "" });
  const _statusOrder = Object.keys(PJ_STATUS);
  const statusOpts = [...new Set(projects.map((p) => p.status).filter(Boolean))]
    .sort((a, b) => _statusOrder.indexOf(a) - _statusOrder.indexOf(b));
  const engineOpts = [...new Set(projects.flatMap((p) => enginesOf(p)))]
    .sort((a, b) => [...ENGINE_ORDER, "equip"].indexOf(a) - [...ENGINE_ORDER, "equip"].indexOf(b));
  const catOpts = [...new Set(projects.map((p) => p.phase).filter(Boolean))].sort();
  const anyFilter = !!(filters.status || filters.engine || filters.cat || filters.origin);
  const matchFilter = (p) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.engine && !enginesOf(p).includes(filters.engine)) return false;
    if (filters.cat && p.phase !== filters.cat) return false;
    if (filters.origin === "planned" && p.origin !== "planned") return false;
    if (filters.origin === "added" && p.origin === "planned") return false;
    return true;
  };

  const reqProject = () => { if (onCompose) onCompose(); else onNav("tickets"); };

  return (
    <div className="content pj-screen" data-screen-label="02 Playbook">

      {/* ===== 1 · Waiting on you ===== */}
      <div className="pj-wait-card">
        <div className="pj-wait-head">
          <span className="pj-sec-ic num" style={{ background: "rgba(133,107,32,0.12)", color: "#856b20" }}>{loading ? "—" : pending.length + (leadsToQualify > 0 ? 1 : 0) + nlExtra}</span>
          <div className="pj-sec-titles"><div className="pj-sec-title">Waiting on you</div></div>
        </div>
        <div className="pj-wait-divider" />
      <div className="pj-cards">
        {loading ? Array.from({ length: skelCount }).map((_, i) => (
          <div key={`sk${i}`} className="pj-card skel" aria-hidden="true">
            <div className="pj-skel-head"><span className="pj-skel-av" /><div className="pj-skel-lines"><div className="pj-skel-line w60" /><div className="pj-skel-line w40" /></div></div>
            <div className="pj-skel-line w90" /><div className="pj-skel-line w70" />
            <div className="pj-skel-btns"><span /><span /></div>
          </div>
        )) : pending.map((t) => (
          <div key={t.id} className="pj-card pj-clickable" role="button" tabIndex={0} onClick={() => onNav("tickets", t.id)}>
            <div className="pj-card-head2">
              <span className="pj-req-av" style={{ background: catColor(t.requester || t.id) }}>{(t.requester || "?").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}</span>
              <div className="pj-head2-main">
                <span className="pj-head2-name">{t.requester || "New request"}</span>
                <div className="pj-head2-sub">
                  <span className="pj-head2-meta">{`${openers[t.id] ? "Alloy" : (DATA.account?.shortName || DATA.account?.company || "Client")} started this${counts[t.id] != null ? ` · ${counts[t.id]} ${counts[t.id] === 1 ? "reply" : "replies"}` : ""}`}</span>
                </div>
              </div>
            </div>
            <div className="pj-card-title">{t.title}</div>
            {summaries[t.id] ? (
              <div className="pj-summary">
                <I.Sparkle width={13} height={13} />
                <div className="pj-summary-body">
                  <div className="pj-summary-kicker">Your move</div>
                  <div>{summaries[t.id]}</div>
                </div>
              </div>
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
        {!loading && nlReq ? (
          <div className="pj-card lead pj-clickable" role="button" tabIndex={0} onClick={onNewsletter}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewsletter(); } }}>
            <div className="pj-card-top">
              <span className="pj-leadtag" style={{ background: "var(--alloy-pink-tint)", color: "var(--alloy-pink)" }}>Newsletter</span>
              {nlReq.dueDate ? <span className="pj-due lead"><I.Clock width={11} height={11} /> due {fmtDue(nlReq.dueDate)}</span> : null}
            </div>
            <div className="pj-lead-hero">
              <div aria-hidden="true" style={{ color: "var(--alloy-pink)", display: "flex", alignItems: "center" }}><I.Send width={30} height={30} /></div>
              <div className="pj-lead-sub">{nlReq.title} — tell us what to feature</div>
            </div>
            <div className="pj-cta"><span className="pj-card-msg solo lead">Open Form <I.Arrow width={14} height={14} /></span></div>
          </div>
        ) : null}
        {tickets !== null && pending.length === 0 && leadsToQualify === 0 && !nlReq ? (
          <div className="pj-empty">Nothing waiting on you — you're all caught up.</div>
        ) : null}
      </div>
      </div>

      {/* ===== We're on it — open tickets we're actively handling (no client action) ===== */}
      {!loading && openTix.length ? (
        <div className="pj-driving-card pj-onit-card">
          <SecHead icon={<I.Ticket width={16} height={16} />} tone="#2c7d68"
            title="We're on it" countBg="rgba(44,125,104,0.12)" countFg="#2c7d68"
            count={openTix.length} />
          <div className="pj-sec-divider" />
          <div className="pj-group pj-group-tix" style={{ "--g": "#2c7d68" }}>
            <button className="pj-group-head" onClick={() => setOpen((o) => ({ ...o, tickets: !o.tickets }))}>
              <span className={`pj-chev${open.tickets ? " open" : ""}`}><I.Chevron width={15} height={15} /></span>
              <span className="pj-dot" />
              <span className="pj-group-label">Open tickets</span>
              <span className="pj-group-count">{openTix.length}</span>
              <div className="grow" />
              <span className="pj-bg-note">No action needed</span>
            </button>
            {open.tickets ? (
              <div className="pj-prows">
                {openTix.map((t) => (
                  <div key={t.id} className="pj-trow pj-clickable" role="button" tabIndex={0} onClick={() => onNav("tickets", t.id)}>
                    <div className="pj-trow-main">
                      <div className="pj-trow-title">{t.title}</div>
                    </div>
                    {progress[t.id] != null ? (
                      <div className="pj-trow-prog"><PjBar value={progress[t.id]} color={stageColor(progress[t.id])} /><span className="pj-pct">{progress[t.id]}%</span></div>
                    ) : null}
                    <OpenedBy t={t} />
                    <span className="pj-onit">On it</span>
                    <span className="pj-view">View <I.Arrow width={13} height={13} /></span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ===== Projects we're driving — in-motion projects ===== */}
      <div className="pj-driving-card">
      {/* Desktop header — title + metrics beside (hidden on narrow cards). */}
      <div className="pj-dhead">
      <SecHead icon={<I.Bolt width={16} height={16} />} tone="#8a8395"
        title="Projects we're driving" countBg="rgba(52,29,76,0.09)" countFg="#341d4c"
        count={loading ? null : inMotion}
        right={qs.hasData ? (
          <div className="pj-driving-metrics">
            <div className="pj-dm-summary">
              <span className="pj-dm-pct">{qs.pct}<span className="pj-dm-sym">%</span></span>
              <div className="pj-dm-meta">
                <span className="pj-dm-cap">of quarter complete</span>
                <div className="pj-dm-sub">
                  <span className={`pj-dm-pace${qs.pace === "On track" ? "" : " behind"}`}><span className="pj-dm-dot" />{qs.pace}</span>
                  {qs.planned > 0 ? <span className="pj-dm-scope">+{qs.scopeDelta}%</span> : null}
                </div>
              </div>
            </div>
            <div className="up-panel pj-up-panel">
              {qs.planned > 0 ? (
                <div className="up-zone planned" style={{ flex: qs.planned }}>
                  <div className="up-head"><span className="up-t">Planned</span><span className="up-c">{qs.planned}</span></div>
                  <div className="up-bar">
                    {qs.plannedDone > 0 ? <span className="up-seg done" style={segStyle(qs.plannedDone)}>{qs.plannedDone}</span> : null}
                    {qs.plannedMotion > 0 ? <span className="up-seg motion" style={segStyle(qs.plannedMotion)}>{qs.plannedMotion}</span> : null}
                  </div>
                </div>
              ) : null}
              {qs.planned > 0 && qs.added > 0 ? <div className="up-sep" /> : null}
              {qs.added > 0 ? (
                <div className="up-zone added" style={{ flex: qs.added }}>
                  <div className="up-head"><span className="up-t">Added</span><span className="up-c">{qs.added}</span></div>
                  <div className="up-bar">
                    {qs.addedDone > 0 ? <span className="up-seg done" style={segStyle(qs.addedDone)}>{qs.addedDone}</span> : null}
                    {qs.addedMotion > 0 ? <span className="up-seg motion" style={segStyle(qs.addedMotion)}>{qs.addedMotion}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null} />
      </div>

      {/* Mobile header — vertical layout per the dev handoff (shown on narrow cards). */}
      {qs.hasData ? (
        <div className="pj-mhead">
          <div className="pj-mh-titlerow">
            <span className="pj-mh-num">{loading ? "—" : inMotion}</span>
            <span className="pj-mh-title">Projects we're driving</span>
          </div>
          <div className="pj-mh-complete">
            <div className="pj-mh-pct">{qs.pct}<span className="pj-mh-sym">%</span></div>
            <div className="pj-mh-completemeta">
              <div className="pj-mh-cap">of quarter complete</div>
              <div className="pj-mh-tags">
                <span className={`pj-mh-pace${qs.pace === "On track" ? "" : " behind"}`}><span className="pj-mh-dot" />{qs.pace}</span>
                {qs.planned > 0 ? <span className="pj-mh-vs">+{qs.scopeDelta}% vs plan</span> : null}
              </div>
            </div>
          </div>
          <div className="pj-mh-scope">
            <span className="pj-mh-lbl">Scope</span>
            <span className="pj-mh-tot">{qs.total} tasks</span>
          </div>
          {[
            { k: "Planned", total: qs.planned, done: qs.plannedDone, motion: qs.plannedMotion, added: false },
            { k: "Added", total: qs.added, done: qs.addedDone, motion: qs.addedMotion, added: true },
          ].filter((z) => z.total > 0).map((z) => (
            <div key={z.k} className={`pj-mh-zone${z.added ? " added" : ""}`}>
              <div className="pj-mh-zhead"><span className="pj-mh-t">{z.k}</span><span className="pj-mh-c">{z.total}</span></div>
              <div className="pj-mh-bar">
                {z.done > 0 ? <span className="pj-mh-seg done" style={{ flex: z.done }}>{z.done}</span> : null}
                {z.motion > 0 ? <span className="pj-mh-seg motion" style={{ flex: z.motion }}>{z.motion}</span> : null}
              </div>
            </div>
          ))}
          <div className="pj-mh-legend">
            <span className="pj-mh-leg"><span className="pj-mh-sw done" /> Delivered</span>
            <span className="pj-mh-leg"><span className="pj-mh-sw motion" /> In motion</span>
          </div>
        </div>
      ) : null}

      <div className="pj-sec-divider" />

      {/* Unobtrusive filter — status / engine / category. Narrows visible rows. */}
      <div className="pj-filterbar">
        <span className="pj-filter-ic"><I.Filter width={14} height={14} /></span>
        <div className="pj-filter-field">
          <select className={`pj-filter-sel${filters.origin ? " on" : ""}`} value={filters.origin} aria-label="Filter by planned vs added"
            onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}>
            <option value="">All work</option>
            <option value="planned">Planned</option>
            <option value="added">Added</option>
          </select>
          <I.Chevron className="pj-filter-chev" width={13} height={13} />
        </div>
        <div className="pj-filter-field">
          <select className={`pj-filter-sel${filters.status ? " on" : ""}`} value={filters.status} aria-label="Filter by status"
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {statusOpts.map((s) => <option key={s} value={s}>{(PJ_STATUS[s] || {}).label || s}</option>)}
          </select>
          <I.Chevron className="pj-filter-chev" width={13} height={13} />
        </div>
        <div className="pj-filter-field">
          <select className={`pj-filter-sel${filters.engine ? " on" : ""}`} value={filters.engine} aria-label="Filter by engine"
            onChange={(e) => setFilters((f) => ({ ...f, engine: e.target.value }))}>
            <option value="">All engines</option>
            {engineOpts.map((eid) => <option key={eid} value={eid}>{(ENGINES[eid] || {}).label || eid}</option>)}
          </select>
          <I.Chevron className="pj-filter-chev" width={13} height={13} />
        </div>
        <div className="pj-filter-field">
          <select className={`pj-filter-sel${filters.cat ? " on" : ""}`} value={filters.cat} aria-label="Filter by category"
            onChange={(e) => setFilters((f) => ({ ...f, cat: e.target.value }))}>
            <option value="">All categories</option>
            {catOpts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <I.Chevron className="pj-filter-chev" width={13} height={13} />
        </div>
        {anyFilter ? <button className="pj-filter-clear" onClick={() => setFilters({ status: "", engine: "", cat: "", origin: "" })}>Clear</button> : null}
      </div>

      <div className="pj-groups">
        {groups.map((g) => {
          const isOpen = open[g.id] || anyFilter; // filtering reveals matches in any group
          const items = anyFilter ? g.items.filter(matchFilter) : g.items;
          if (anyFilter && !items.length) return null;
          return (
            <div key={g.id} className="pj-group" style={{ "--g": g.color }}>
              <button className={`pj-group-head${g.id === "live" ? " done" : ""}`} onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                <span className={`pj-chev${isOpen ? " open" : ""}`}><I.Chevron width={15} height={15} /></span>
                <span className="pj-dot" />
                <span className="pj-group-label">{g.label}</span>
                <span className="pj-group-count">{items.length}</span>
                <div className="grow" />
                {g.id === "live"
                  ? <span className="pj-done-note"><I.Check width={13} height={13} /> Delivered &amp; live</span>
                  : <span className="pj-group-stat">{items.length} in motion · {g.done} delivered</span>}
              </button>
              {isOpen ? (
                <div className="pj-prows">
                  {items.map((p) => (
                    <ProjRow key={p.id} p={p} isOverdue={isOverdue} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {anyFilter && !groups.some((g) => g.items.some(matchFilter)) ? (
          <div className="pj-empty">No projects match these filters.</div>
        ) : null}
      </div>
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
