import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { BadgeMedalSmall } from './screen-dashboard.jsx';
import TicketThread from './TicketThread.jsx';
import { zdList } from '../lib/zendesk.js';
import { qualifyLead } from '../lib/leads.js';

// Tickets, Playbook, Library, Recognition
const { useState: _useState2, useEffect: _useEffect2 } = React;
const useState = _useState2;
const useEffect = _useEffect2;

function TicketsScreen() {
  const [tickets, setTickets] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [filter, setFilter] = useState("mytasks");
  const [query, setQuery] = useState("");

  const loadList = () => {
    zdList()
      .then((res) => {
        const list = (res && res.tickets) || [];
        setTickets(list);
        setActiveId((cur) => cur || (list[0] && list[0].id) || null);
      })
      .catch((e) => { setError(String(e.message || e)); setTickets([]); });
  };
  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-facing buckets: pending = waiting on the client ("My Tasks");
  // open/new/hold = team actively working ("In-Progress"); All = everything.
  const inMyTasks = (t) => t.status === "pending";
  const inProgress = (t) => ["open", "new", "hold"].includes(t.status);
  const all = tickets || [];
  const counts = { mytasks: all.filter(inMyTasks).length, inprogress: all.filter(inProgress).length };
  const byFilter = all.filter((t) => filter === "mytasks" ? inMyTasks(t) : filter === "inprogress" ? inProgress(t) : true);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? byFilter.filter((t) => (t.title || "").toLowerCase().includes(q) || String(t.id).includes(q))
    : byFilter;
  const clientName = (DATA.account && (DATA.account.shortName || DATA.account.company)) || "My";
  const emptyMsg = q ? "No tickets match your search."
    : filter === "mytasks" ? "Nothing needs you right now."
    : filter === "inprogress" ? "No tickets in progress."
    : "No tickets.";

  const FBTN = (id, label) => (
    <button onClick={() => setFilter(id)} className="btn btn-sm"
      style={{ background: filter === id ? "var(--alloy-purple)" : "transparent", color: filter === id ? "#fff" : "var(--alloy-purple)", padding: "5px 11px" }}>
      {label}
    </button>
  );

  return (
    <div className="content" data-screen-label="04 Support">
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 0, border: "1px solid var(--border-subtle)", borderRadius: 14, overflow: "hidden", background: "#fff", minHeight: 620 }}>
        {/* Left list */}
        <div style={{ borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8, background: "var(--alloy-off-white)" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {FBTN("mytasks", `${clientName} Tasks (${counts.mytasks})`)}
              {FBTN("inprogress", `In-Progress (${counts.inprogress})`)}
              {FBTN("all", "All")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px" }}>
              <I.Search width={14} height={14} style={{ color: "var(--fg-muted)", flexShrink: 0 }} />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tickets…"
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--fg)" }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tickets === null ? (
              <div style={{ padding: "22px", fontSize: 13, color: "var(--fg-muted)" }}>Loading tickets…</div>
            ) : error ? (
              <div style={{ padding: "22px", fontSize: 13, color: "var(--alloy-pink)" }}>Couldn’t load tickets. {error}</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "22px", fontSize: 13, color: "var(--fg-muted)" }}>{emptyMsg}</div>
            ) : filtered.map((t) => (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 16px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", background: activeId === t.id ? "var(--alloy-purple-tint)" : "#fff" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)" }}>#{t.id}</span>
                  <span className="tag tag-outline" style={{ textTransform: "capitalize" }}>{t.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--alloy-purple)", lineHeight: 1.3 }}>{t.title}</div>
                {t.requester ? (
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--alloy-purple-tint)", color: "var(--alloy-purple)", fontSize: 8, fontWeight: 800 }}>
                      {(t.requester || "").split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase()}
                    </span>
                    {t.requester}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        {/* Right detail */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {activeId ? (
            <TicketThread id={activeId} onChanged={loadList} />
          ) : (
            <div style={{ padding: "40px 22px", fontSize: 13, color: "var(--fg-muted)" }}>
              {tickets === null ? "" : "Select a ticket to view the conversation."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ t }) {
  const messages = [
    { from: "you", name: DATA.user.name, avatar: DATA.user.initials, text: t.excerpt, time: t.time },
    { from: "alloy", name: t.agent, avatar: t.agent.split(" ").map(s=>s[0]).join(""), text: "Got it — pulling this into our queue now. Cameron will own the rollout and we'll have it live before EOD tomorrow. Mind if we batch this with the GBP listings update we mentioned last week?", time: "8 min ago" },
    { from: "you", name: DATA.user.name, avatar: DATA.user.initials, text: "Perfect — yes please batch them. Appreciate the speed!", time: "5 min ago" },
  ];
  return (
    <>
      <div style={{padding:"16px 22px", borderBottom:"1px solid var(--border-subtle)", display:"flex", alignItems:"center", gap:12}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
            <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-muted)"}}>{t.id}</span>
            <span className="tag tag-status-progress"><span className="dot"/>Awaiting Alloy</span>
            <span className="tag tag-outline" style={{textTransform:"uppercase"}}>{t.priority}</span>
          </div>
          <div style={{fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--alloy-purple)"}}>{t.title}</div>
        </div>
        <button className="btn btn-secondary btn-sm">Mark resolved</button>
      </div>
      <div style={{padding:"22px 22px", flex:1, overflowY:"auto", background:"var(--alloy-off-white)", display:"flex", flexDirection:"column", gap: 14}}>
        {messages.map((m, i) => <Message key={i} m={m}/>)}
        <div style={{display:"flex", alignItems:"center", gap:8, color:"var(--fg-muted)", fontSize:11, alignSelf:"center", padding:"6px 12px", background:"#fff", borderRadius:999, border:"1px dashed var(--border-subtle)"}}>
          <I.Sparkle width={12} height={12} style={{color:"var(--alloy-pink)"}}/> Auto-routed to Cameron · also notifying #alloy-rise on Slack
        </div>
      </div>
      <div style={{padding:"14px 22px", borderTop:"1px solid var(--border-subtle)", background:"#fff"}}>
        <div style={{display:"flex", gap:10, alignItems:"flex-end"}}>
          <textarea className="input" rows={2} placeholder="Reply to your team…" style={{resize:"none", minHeight:60}}/>
          <button className="btn btn-primary"><I.Send width={13} height={13}/> Send</button>
        </div>
        <div style={{marginTop:8, display:"flex", gap:10, fontSize:11, color:"var(--fg-muted)"}}>
          <span>📎 Attach</span><span>🔗 Link a project</span><span>⚡ Insert template</span>
        </div>
      </div>
    </>
  );
}

function Message({ m }) {
  const isYou = m.from === "you";
  return (
    <div style={{display:"flex", gap:10, flexDirection: isYou?"row-reverse":"row", maxWidth:"85%", alignSelf: isYou?"flex-end":"flex-start"}}>
      <div style={{width:32, height:32, borderRadius:999, display:"grid", placeItems:"center", flexShrink:0, fontFamily:"var(--font-display)", fontSize:11, fontWeight:800, background: isYou?"linear-gradient(135deg, var(--alloy-yellow), var(--alloy-pink))":"var(--alloy-purple)", color: isYou?"var(--alloy-purple)":"#fff"}}>{m.avatar}</div>
      <div style={{minWidth:0}}>
        <div style={{display:"flex", alignItems:"baseline", gap:8, marginBottom:4, flexDirection: isYou?"row-reverse":"row"}}>
          <span style={{fontSize:12.5, fontWeight:700, color:"var(--alloy-purple)"}}>{m.name}</span>
          <span style={{fontSize:11, color:"var(--fg-muted)"}}>{m.time}</span>
        </div>
        <div style={{padding:"12px 14px", background: isYou?"var(--alloy-purple)":"#fff", color: isYou?"#fff":"var(--fg-3)", borderRadius:10, fontSize:13.5, lineHeight:1.5, border: isYou?"none":"1px solid var(--border-subtle)"}}>{m.text}</div>
      </div>
    </div>
  );
}

function ComposeRequest({ onCancel }) {
  return (
    <div style={{padding:"22px 26px", flex:1, display:"flex", flexDirection:"column"}}>
      <div style={{display:"flex", alignItems:"center", marginBottom:18}}>
        <div>
          <div style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".12em", color:"var(--alloy-pink)"}}>New request</div>
          <div style={{fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--alloy-purple)", marginTop:2}}>What can your Alloy team do for you?</div>
        </div>
        <div style={{marginLeft:"auto"}}><button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button></div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:14, flex:1}}>
        <div>
          <label style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", color:"var(--fg-muted)"}}>Type</label>
          <div style={{display:"flex", gap:6, marginTop:6, flexWrap:"wrap"}}>
            {["Site update", "Content request", "Strategy question", "Bug / fix", "New project", "Other"].map((tp, i) => (
              <button key={tp} className="tag" style={{cursor:"pointer", border: i===0?"1px solid var(--alloy-pink)":"1px solid var(--border-subtle)", background: i===0?"var(--alloy-pink-tint)":"#fff", color: i===0?"#a82451":"var(--alloy-purple)", padding:"7px 12px"}}>{tp}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", color:"var(--fg-muted)"}}>Subject</label>
          <input className="input" defaultValue="Update phone number on every site footer" style={{marginTop:6}}/>
        </div>
        <div style={{flex:1}}>
          <label style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", color:"var(--fg-muted)"}}>Tell us what you need</label>
          <textarea className="input" rows={6} style={{marginTop:6, minHeight:160, resize:"vertical"}} defaultValue="Hi team — we just changed our main 800 number to 855-555-0144. Can you push it everywhere it shows on our site, including the GBP listings, footer, and contact page? No rush, but ideally before Friday since we're sending out a mailer."/>
        </div>
        <div>
          <label style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", color:"var(--fg-muted)"}}>Priority</label>
          <div style={{display:"flex", gap:6, marginTop:6}}>
            {[{l:"Low",c:"var(--alloy-blue)"},{l:"Normal",c:"var(--alloy-yellow)"},{l:"Urgent",c:"var(--alloy-pink)"}].map((p, i) => (
              <button key={p.l} className="tag" style={{cursor:"pointer", border: i===1?`1.5px solid ${p.c}`:"1px solid var(--border-subtle)", background: i===1?"var(--alloy-yellow-tint)":"#fff", color: i===1?"#7a5a14":"var(--alloy-purple)", padding:"7px 14px"}}>{p.l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:"flex", gap:10, marginTop:18, paddingTop:14, borderTop:"1px solid var(--border-subtle)"}}>
        <button className="btn btn-primary" style={{flex:1, justifyContent:"center"}}><I.Send width={13} height={13}/> Send to Alloy team</button>
        <button className="btn btn-secondary">Save draft</button>
      </div>
    </div>
  );
}

// =================== One year roadmap ===================
function PlaybookScreen({ onNav }) {
  const nowIdx = DATA.roadmap.findIndex(q => q.state === "now");
  const progressPct = ((nowIdx + 0.5) / DATA.roadmap.length) * 100;
  const stateLabel = { done: "Completed", now: "In progress", next: "Up next", future: "Planned" };
  return (
    <div className="content" data-screen-label="05 One year roadmap">
      {/* Year timeline — header rail (Q nodes + meta) over content grid (priorities + CTAs) */}
      <div className="year-timeline">
        <div className="yt-head">
          <div className="yt-rail">
            <div className="yt-rail-fill" style={{ width: `${progressPct}%` }}/>
          </div>
          {DATA.roadmap.map((q, i) => (
            <div key={i} className="yt-head-col" data-state={q.state}>
              <div className="yt-dot">{q.state === "done" ? "✓" : q.state === "now" ? "●" : ""}</div>
              <div className="yt-q">{q.q.replace(" 2026","")}</div>
              <div className="yt-months">{q.months}</div>
              <div className="yt-status">
                {q.state === "done" ? "✓ " : q.state === "now" ? "● " : ""}{stateLabel[q.state]}
              </div>
            </div>
          ))}
        </div>
        <div className="yt-body">
          {DATA.roadmap.map((q, i) => (
            <div key={i} className="yt-body-col" data-state={q.state}>
              <div className="yt-focus-title">Quarter priorities</div>
              <ul className="yt-focuses">
                {q.focuses.map((f, j) => (
                  <li key={j} className="yt-focus" data-status={f.s}>
                    <span className="yt-focus-ic" aria-hidden="true">
                      {f.s === "complete" ? "✓" : f.s === "missed" ? "✕" : "○"}
                    </span>
                    <span className="yt-focus-t">{f.t}</span>
                  </li>
                ))}
              </ul>
              <div className="yt-actions">
                <a
                  href={q.file ? q.file.replace("playbook","report") : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm yt-btn"
                >
                  <I.Doc width={13} height={13}/>
                  <span>{q.q.replace(" 2026","")} Report</span>
                </a>
                <a
                  href={q.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn ${q.state === "now" ? "btn-primary" : q.state === "done" ? "btn-dark" : "btn-secondary"} btn-sm yt-btn`}
                >
                  <I.Map width={13} height={13}/>
                  <span>{q.q.replace(" 2026","")} Playbook</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan & limits transparency */}
      <div className="card card-pad-lg" style={{marginTop: 24}}>
        <div className="card-head">
          <h3>Your BoardSuite Accelerate plan</h3>
          <div className="grow"/>
        </div>
        <div className="col-2" style={{gap: 16}}>
          <PlanLimit label="Quarterly Fuel Budget" used={78} total={100} unit="pts" hint="22 pts free · room for a course or 5 blog posts" />
          <PlanLimit label="Locations covered" used={1} total={1} unit="locations" cta="Add location" />
        </div>

        <div style={{marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--alloy-light-gray)"}}>
          <div style={{display:"flex", alignItems:"baseline", gap:10, marginBottom: 4}}>
            <div style={{fontSize:11, fontWeight:800, color:"var(--alloy-purple)", textTransform:"uppercase", letterSpacing:".12em"}}>Always-on services</div>
            <div style={{fontSize:12, color:"var(--fg-muted)", fontWeight:600}}>included in your plan · running in the background</div>
          </div>
        </div>
        <div className="plan-services">
          {[
            { id:"local-takeover", name:"Local Takeover", desc:"3 markets · top-3 in 8", cadence:"Always-on", state:"on", icon:<I.Map width={16} height={16}/> },
            { id:"gbp", name:"GBP Optimization", desc:"3 listings · 2.8K views/mo", cadence:"Weekly", state:"on", icon:<I.Map width={16} height={16}/> },
            { id:"seo-geo", name:"SEO + GEO", desc:"Technical SEO + AI search", cadence:"Monthly", state:"on", icon:<I.Search width={16} height={16}/> },
            { id:"content", name:"Content Engine", desc:"2 long-form + 4 social/mo", cadence:"Monthly", state:"on", icon:<I.Doc width={16} height={16}/> },
            { id:"reviews", name:"Reputation", desc:"4.8★ · review gen + response", cadence:"Always-on", state:"on", icon:<I.Star width={16} height={16}/> },
            { id:"ppc", name:"PPC Management", desc:"Paused · not in current plan", cadence:"Off", state:"off", icon:<I.Bolt width={16} height={16}/> },
          ].map(s => (
            <div key={s.id} className="plan-service" data-state={s.state}>
              <div className="ps-ico">{s.icon}</div>
              <div className="ps-body">
                <div className="ps-name">{s.name}</div>
                <div className="ps-meta">
                  <span className="ps-pill">{s.cadence}</span>
                  <span>{s.desc}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseCard({ lane, title, subtitle, desc, stat, sub, pct }) {
  const colors = { attract: "var(--alloy-pink)", close: "var(--alloy-blue)", keep: "var(--alloy-green)" };
  const c = colors[lane];
  return (
    <div className="card card-pad" style={{borderLeft: `4px solid ${c}`}}>
      <div style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".12em", color:c}}>{subtitle}</div>
      <div style={{fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:"var(--alloy-purple)", marginTop:4}}>{title}</div>
      <p style={{fontSize:13, color:"var(--fg-3)", lineHeight:1.5, margin:"8px 0 14px"}}>{desc}</p>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8}}>
        <div><div style={{fontFamily:"var(--font-display)", fontSize:24, fontWeight:800, color:"var(--alloy-purple)", lineHeight:1}}>{stat}</div><div style={{fontSize:11, color:"var(--fg-muted)", fontWeight:600, marginTop:2}}>{sub}</div></div>
        <div style={{fontFamily:"var(--font-display)", fontSize:13, fontWeight:800, color:c}}>{pct}%</div>
      </div>
      <div className="progress"><div className="bar" style={{width:`${pct}%`, background: c}}/></div>
    </div>
  );
}

function PlanLimit({ label, used, total, unit, hint, cta }) {
  const pct = (used/total)*100;
  return (
    <div style={{padding:"14px 16px", border:"1px solid var(--border-subtle)", borderRadius:10}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
        <div style={{fontSize:11, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:".1em", fontWeight:700}}>{label}</div>
        <div style={{fontFamily:"var(--font-display)", fontSize:14, fontWeight:800, color:"var(--alloy-purple)"}}>{used}<span style={{color:"var(--fg-muted)", fontWeight:500}}>/{total} {unit}</span></div>
      </div>
      <div className="progress" style={{marginTop:10, height:12}}><div className="bar" style={{width:`${pct}%`, background:"#00c875"}}/></div>
      {hint ? <div style={{fontSize:11.5, color:"var(--fg-muted)", marginTop: 8, lineHeight:1.4}}>{hint}</div> : null}
      {cta ? <button className="btn btn-ghost btn-sm" style={{marginTop:8, padding:"4px 0"}}>{cta} →</button> : null}
    </div>
  );
}

// =================== Library ===================
function LibraryScreen() {
  const [tab, setTab] = useState("all");
  const filtered = DATA.library.filter(l => tab === "all" || l.lane === tab);
  return (
    <div className="content" data-screen-label="06 Library">
      <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:14, flexWrap:"wrap"}}>
        <h2 style={{fontFamily:"var(--font-display)", fontSize:"clamp(22px, 5vw, 28px)", fontWeight:800, color:"var(--alloy-purple)", margin:0, letterSpacing:"-0.01em"}}>Resource library</h2>
        <div style={{marginLeft:"auto", display:"flex", gap:6, alignItems:"center", flexWrap:"wrap"}}>
          {[{id:"all",l:"All"},{id:"attract",l:"BoardReach"},{id:"close",l:"BoardMatch"},{id:"keep",l:"BoardRetain"},{id:"energy",l:"L&D"}].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} className="btn btn-sm" style={{background: tab===tb.id?"var(--alloy-purple)":"transparent", color: tab===tb.id?"#fff":"var(--alloy-purple)", padding:"6px 12px"}}>{tb.l}</button>
          ))}
        </div>
      </div>

      {/* Featured */}
      <div className="card" style={{padding:0, overflow:"hidden", marginBottom: 24}}>
        <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr"}}>
          <div style={{padding:"32px 36px", background:"linear-gradient(120deg, var(--alloy-purple) 0%, var(--alloy-purple-deep) 100%)", color:"#fff"}}>
            <div style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".12em", color:"var(--alloy-yellow)"}}>Featured · new for Q1</div>
            <h3 style={{fontFamily:"var(--font-display)", fontSize: 28, fontWeight:800, lineHeight:1.15, margin:"10px 0 14px", color:"#fff", letterSpacing:"-0.01em"}}>Outsmarting AI Search</h3>
            <p style={{fontSize:14, lineHeight:1.6, color:"rgba(255,255,255,0.78)", margin:"0 0 18px"}}>How micro-courses drive clicks, credibility, and conversions in the era of Perplexity, Gemini, and Google AI Overviews. Five lessons. Built specifically for CAM operators.</p>
            <div style={{display:"flex", gap:10}}>
              <button className="btn btn-primary"><I.Bolt width={13} height={13}/> Start the course</button>
              <button className="btn btn-secondary" style={{background:"rgba(255,255,255,0.08)", color:"#fff", borderColor:"rgba(255,255,255,0.18)"}}>Read pillar page</button>
            </div>
          </div>
          <div style={{position:"relative", background:"linear-gradient(135deg, var(--alloy-pink) 0%, #8a1f48 100%)", display:"grid", placeItems:"center", overflow:"hidden"}}>
            <div style={{position:"absolute", inset:0, background:"radial-gradient(circle at 30% 30%, rgba(245,216,128,0.4) 0%, transparent 60%)"}}/>
            <div style={{position:"relative", textAlign:"center", color:"#fff", padding: 24}}>
              <div style={{fontFamily:"var(--font-display)", fontWeight:900, fontSize:60, letterSpacing:"-0.02em", lineHeight:0.9}}>5</div>
              <div style={{fontSize:14, fontWeight:700, textTransform:"uppercase", letterSpacing:".14em", marginTop:6}}>Lessons</div>
              <div style={{display:"flex", gap:6, marginTop:18, justifyContent:"center"}}>
                {[1,2,3,4,5].map(n => <div key={n} style={{width:36, height:6, background:n<=2?"var(--alloy-yellow)":"rgba(255,255,255,0.4)", borderRadius:999}}/>)}
              </div>
              <div style={{fontSize:12, marginTop:10, color:"rgba(255,255,255,0.85)", fontWeight:600}}>Lesson 2 of 5 · ~14 min left</div>
            </div>
          </div>
        </div>
      </div>

      <div className="library-grid">
        {filtered.map((l, i) => (
          <div key={i} className="lib-card">
            <div className={`cover ${l.lane}`}>
              <span className="stage">{l.stage}</span>
              <span className="ttl">{l.ttl}</span>
            </div>
            <div className="body">
              <div className="meta">{l.meta}</div>
              <div className="desc">{l.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================== Recognition ===================
function RecognitionScreen() {
  const earned = DATA.badges.filter(b => b.state === "earned");
  const inprog = DATA.badges.filter(b => b.state === "progress");
  const locked = DATA.badges.filter(b => b.state === "locked");

  return (
    <div className="content" data-screen-label="07 Recognition">
      <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:18, flexWrap:"wrap"}}>
        <h2 style={{fontFamily:"var(--font-display)", fontSize:"clamp(22px, 5vw, 28px)", fontWeight:800, color:"var(--alloy-purple)", margin:0, letterSpacing:"-0.01em"}}>Recognition</h2>
        <div style={{marginLeft:"auto"}}>
          <span className="tier-pill accelerate" style={{fontSize:12, padding:"7px 14px"}}><span className="star">★</span> BoardSuite Accelerate</span>
        </div>
      </div>

      {/* Hero summary */}
      <div className="card card-pad-lg" style={{marginBottom:24, background:"linear-gradient(120deg, var(--alloy-purple) 0%, #1f0e30 100%)", color:"#fff", border:"none", overflow:"hidden", position:"relative"}}>
        <div style={{position:"absolute", right:-100, top:-100, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle, rgba(245,216,128,0.2) 0%, transparent 70%)"}}/>
        <div style={{display:"grid", gridTemplateColumns:"auto 1fr 1fr 1fr", gap:32, alignItems:"center", position:"relative"}}>
          <div style={{textAlign:"center"}}>
            <BadgeMedalSmall color="#f5d880" state="earned"/>
            <div style={{fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--alloy-yellow)", marginTop:10, letterSpacing:".06em", textTransform:"uppercase"}}>Authority<br/>tier</div>
          </div>
          <SummaryStat n={earned.length} l="Badges earned" sub={`of ${DATA.badges.length} total`}/>
          <SummaryStat n="32 days" l="Login streak" sub="🔥 best yet"/>
          <SummaryStat n="$612K" l="Lifetime impact" sub="Alloy-attributed"/>
        </div>
      </div>

      {/* Earned */}
      <div className="section-title"><span className="pip"/>Earned ({earned.length}) <a style={{cursor:"pointer"}}>Share to LinkedIn →</a></div>
      <div className="badge-grid">
        {earned.map(b => <BigBadge key={b.id} b={b}/>)}
      </div>

      {/* In progress */}
      <div className="section-title"><span className="pip" style={{background:"var(--alloy-yellow)"}}/>In progress ({inprog.length})</div>
      <div className="badge-grid">
        {inprog.map(b => <BigBadge key={b.id} b={b}/>)}
      </div>

      {/* Locked */}
      <div className="section-title"><span className="pip" style={{background:"var(--alloy-light-gray)"}}/>Up next ({locked.length})</div>
      <div className="badge-grid">
        {locked.map(b => <BigBadge key={b.id} b={b}/>)}
      </div>

      {/* Rewards */}
      <div className="section-title" style={{marginTop:36}}><span className="pip" style={{background:"var(--alloy-pink)"}}/>Real rewards <a style={{cursor:"pointer"}}>Browse all →</a></div>
      <div className="col-3">
        {[
          { label: "Authority Tier perk", title: "Annual swag drop", desc: "RISE-branded gear, an Alloy field guide, and a hand-written note from your team.", cta: "Claim", icon: <I.Heart width={18} height={18}/>, tone: "pink" },
          { label: "Five Wins reward", title: "$500 ad credit", desc: "Auto-applied to next quarter's PPC spend when you cross 5 boards.", cta: "Earned", icon: <I.Bolt width={18} height={18}/>, tone: "yellow", earned: true },
          { label: "Ten Wins reward", title: "Day with the partners", desc: "A full strategy day in Austin with Skyler, Justin & Cameron. On us.", cta: "1 win away", icon: <I.Sparkle width={18} height={18}/>, tone: "purple" },
        ].map((r, i) => (
          <div key={i} className="card card-pad" style={{position:"relative", overflow:"hidden"}}>
            {r.earned ? <div style={{position:"absolute", top:14, right:14}}><span className="tag tag-status-live"><span className="dot"/>Earned</span></div> : null}
            <div style={{width:42, height:42, borderRadius:10, background: r.tone==="pink"?"var(--alloy-pink-tint)":r.tone==="yellow"?"var(--alloy-yellow-tint)":"var(--alloy-purple-tint)", color: r.tone==="pink"?"var(--alloy-pink)":r.tone==="yellow"?"#7a5a14":"var(--alloy-purple)", display:"grid", placeItems:"center", marginBottom:12}}>{r.icon}</div>
            <div style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", color:"var(--fg-muted)"}}>{r.label}</div>
            <div style={{fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--alloy-purple)", marginTop:4}}>{r.title}</div>
            <p style={{fontSize:13, color:"var(--fg-3)", lineHeight:1.5, margin:"8px 0 14px"}}>{r.desc}</p>
            <button className="btn btn-secondary btn-sm" disabled={r.earned}>{r.cta}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ n, l, sub }) {
  return (
    <div>
      <div style={{fontFamily:"var(--font-display)", fontSize: "clamp(28px, 4vw, 40px)", fontWeight:800, color:"#fff", lineHeight:1, letterSpacing:"-0.01em"}}>{n}</div>
      <div style={{fontSize:12, color:"var(--alloy-yellow)", marginTop:8, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em"}}>{l}</div>
      <div style={{fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:2}}>{sub}</div>
    </div>
  );
}

function BigBadge({ b }) {
  const colors = { pink: "#d9356e", yellow: "#f5d880", blue: "#a1c8e7", green: "#aed7d0", purple: "#604a74" };
  return (
    <div className={`badge-card ${b.state==="locked"?"locked":""}`}>
      {b.state==="earned" ? <span className="tag tag-status-live" style={{position:"absolute", top:10, right:10, fontSize:9}}><span className="dot"/>Earned</span> : null}
      <div className="badge-medal">
        <BigBadgeMedal color={colors[b.color]} state={b.state}/>
      </div>
      <div className="name">{b.name}</div>
      <div className="desc">{b.desc}</div>
      {b.state==="earned" ? <div className="earned">{b.earned}</div> : null}
      {b.state==="progress" ? (
        <div style={{marginTop:10}}>
          <div className="progress"><div className="bar" style={{width:`${b.pct}%`, background: colors[b.color]}}/></div>
          <div style={{fontSize:10, color:"var(--fg-muted)", fontWeight:700, marginTop:4, textTransform:"uppercase", letterSpacing:".08em"}}>{b.pct}% there</div>
        </div>
      ) : null}
      {b.state==="locked" ? <div className="earned" style={{color:"var(--fg-muted)"}}>Locked</div> : null}
    </div>
  );
}

function BigBadgeMedal({ color = "#d9356e", state = "earned" }) {
  return (
    <svg viewBox="0 0 78 78" style={{width:"100%", height:"100%"}}>
      <defs>
        <linearGradient id={`bg-${color.replace("#","")}-${state}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color}/>
          <stop offset="100%" stopColor="#381c4f"/>
        </linearGradient>
        <radialGradient id={`bg-shine-${color.replace("#","")}`} cx="0.3" cy="0.3" r="0.6">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <polygon points="39,5 47,11 56,9 60,18 68,22 64,32 67,42 57,46 53,55 39,52 25,55 21,46 11,42 14,32 10,22 18,18 22,9 31,11" fill={state==="locked"?"#e8e4ef":`url(#bg-${color.replace("#","")}-${state})`} stroke={state==="locked"?"#c9c1d6":"#fff"} strokeWidth="1.5"/>
      <polygon points="39,5 47,11 56,9 60,18 68,22 64,32 67,42 57,46 53,55 39,52 25,55 21,46 11,42 14,32 10,22 18,18 22,9 31,11" fill={`url(#bg-shine-${color.replace("#","")})`}/>
      <circle cx="39" cy="32" r="13" fill="#fff" opacity="0.18"/>
      {state==="locked" ? (
        <g><rect x="33" y="29" width="13" height="11" rx="2" fill="#fff"/><path d="M35 29v-4a4.5 4.5 0 0 1 9 0v4" fill="none" stroke="#fff" strokeWidth="2"/></g>
      ) : (
        <text x="39" y="38" textAnchor="middle" fontSize="18" fontWeight="900" fill="#fff" fontFamily="var(--font-display)">★</text>
      )}
      {state==="earned" ? (
        <g>
          <path d="M27 56 L31 70 L35 65 L39 70 L43 65 L47 70 L51 56" fill="#fff" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
        </g>
      ) : null}
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Leads — qualify in-portal. Clients (and staff) triage WhatConverts leads:
// Qualified / Not a fit / Pending. Qualifying can capture a quote value (open
// opportunity) and an annual sales value (closed deal). Writes back to
// WhatConverts via the qualify-lead function; the row updates optimistically.
// ---------------------------------------------------------------------------

const RENDER_CAP = 150;   // cap rows rendered at once (a YTD "not a fit" bucket can be 700+)

const fmtMoney = (n) => {
  const v = Number(n);
  return v > 0 ? `$${v.toLocaleString("en-US")}` : "";
};

// One lead row with an inline qualify panel.
function LeadRow({ lead, onSaved }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [quote, setQuote] = useState(lead.quoteValue ? String(lead.quoteValue) : "");
  const [sales, setSales] = useState(lead.salesValue ? String(lead.salesValue) : "");

  const state = lead.quotable === "yes" ? "qualified"
    : lead.quotable === "no" ? "nofit" : "review";
  const tag = state === "qualified" ? { cls: "tag-status-live", label: "Qualified" }
    : state === "nofit" ? { cls: "tag-outline", label: "Not a fit" }
    : { cls: "tag-status-progress", label: "Pending" };

  const save = async (quotable) => {
    setSaving(true); setErr("");
    const opts = { quotable };
    if (quotable === "yes") {
      if (quote !== "") opts.quoteValue = quote;
      if (sales !== "") opts.salesValue = sales;
    }
    try {
      const updated = await qualifyLead(lead.id, opts);
      // Mock mode (no backend) → synthesize the change locally.
      onSaved(lead.id, updated || {
        ...lead, quotable,
        quality: quotable === "yes" ? "qualified" : "review",
        quote_value: quote ? Number(quote) : lead.quoteValue,
        sales_value: sales ? Number(sales) : lead.salesValue,
        value: fmtMoney(sales || quote || 0),
      });
      setOpen(false);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setSaving(false); }
  };

  const showVal = lead.value || fmtMoney(lead.salesValue || lead.quoteValue || 0);

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--alloy-purple)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</div>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{lead.source}{lead.time ? ` · ${lead.time}` : ""}</div>
        </div>
        {showVal ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--alloy-purple)", fontFamily: "var(--font-display)", flexShrink: 0 }}>{showVal}</span>
        ) : null}
        <span className={`tag ${tag.cls}`} style={{ flexShrink: 0 }}><span className="dot" />{tag.label}</span>
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}
          style={{ flexShrink: 0, background: open ? "var(--alloy-purple)" : "transparent", color: open ? "#fff" : "var(--alloy-purple)", padding: "5px 11px" }}>
          {state === "review" ? "Qualify" : "Edit"}
        </button>
      </div>

      {open ? (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", background: "var(--alloy-off-white)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Quote value <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>open opportunity</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "6px 9px" }}>
                <span style={{ color: "var(--fg-muted)" }}>$</span>
                <input value={quote} onChange={(e) => setQuote(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0"
                  style={{ width: 90, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--fg)" }} />
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Sales value <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>closed deal, annual</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "6px 9px" }}>
                <span style={{ color: "var(--fg-muted)" }}>$</span>
                <input value={sales} onChange={(e) => setSales(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0"
                  style={{ width: 90, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--fg)" }} />
                <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>/yr</span>
              </div>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-sm" disabled={saving} onClick={() => save("yes")}
              style={{ background: "var(--alloy-green, #2c6e62)", color: "#fff", padding: "6px 14px" }}>
              {saving ? "Saving…" : "Mark qualified"}
            </button>
            <button className="btn btn-sm" disabled={saving} onClick={() => save("no")}
              style={{ background: "transparent", color: "var(--fg-muted)", padding: "6px 14px" }}>
              Not a fit
            </button>
            {state !== "review" ? (
              <button className="btn btn-sm" disabled={saving} onClick={() => save("pending")}
                style={{ background: "transparent", color: "var(--fg-muted)", padding: "6px 14px" }}>
                Move to pending
              </button>
            ) : null}
            {err ? <span style={{ fontSize: 12, color: "var(--alloy-pink)" }}>{err}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Tenure: leads with the current-year (YTD) qualified number — the figure that
// matters when you work annually — then prior years and lifetime, plus top
// sources. Fed by the weekly rollup (DATA.account.wc*). Hidden until data.
function TenureBanner() {
  const a = DATA.account || {};
  const total = a.wcQualifiedTotal || 0;
  if (!total) return null;
  const byYear = a.wcQualifiedByYear || {};
  const thisYear = String(new Date().getFullYear());
  const ytd = byYear[thisYear] || 0;
  const since = a.wcFirstLeadAt
    ? new Date(a.wcFirstLeadAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : (a.since || "");
  // Prior years, newest first (exclude the current year — it's the headline).
  const priorYears = Object.keys(byYear).filter((y) => y !== thisYear).sort((x, y) => y.localeCompare(x));
  const sources = Object.entries(a.wcQualifiedBySource || {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return (
    <div style={{ background: "var(--alloy-purple)", color: "#fff", borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>{ytd.toLocaleString("en-US")}</span>
        <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.92 }}>qualified leads in {thisYear} so far</span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, opacity: 0.9 }}>
        {priorYears.map((y) => <span key={y}>{y}: <strong>{byYear[y].toLocaleString("en-US")}</strong></span>)}
        <span>Lifetime: <strong>{total.toLocaleString("en-US")}</strong>{since ? ` since ${since}` : ""}</span>
      </div>
      {sources.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {sources.map(([src, n]) => (
            <span key={src} style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "4px 11px" }}>
              {src} · {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LeadsScreen() {
  const [leads, setLeads] = useState(() => (DATA.recentLeads || []).map((l, i) => ({ ...l, _k: l.id || i })));
  const [filter, setFilter] = useState("review");
  const [query, setQuery] = useState("");

  const onSaved = (id, updated) => {
    setLeads((cur) => cur.map((l) => l.id === id ? {
      ...l,
      quotable: updated.quotable ?? l.quotable,
      quality: updated.quality ?? l.quality,
      value: updated.value ?? l.value,
      quoteValue: updated.quote_value ?? l.quoteValue,
      salesValue: updated.sales_value ?? l.salesValue,
    } : l));
  };

  const stateOf = (l) => l.quotable === "yes" ? "qualified" : l.quotable === "no" ? "nofit" : "review";
  const counts = {
    review: leads.filter((l) => stateOf(l) === "review").length,
    qualified: leads.filter((l) => stateOf(l) === "qualified").length,
    nofit: leads.filter((l) => stateOf(l) === "nofit").length,
  };
  const pipeline = leads.filter((l) => stateOf(l) === "qualified").reduce((s, l) => s + (Number(l.quoteValue) || 0), 0);
  const won = leads.reduce((s, l) => s + (Number(l.salesValue) || 0), 0);

  const q = query.trim().toLowerCase();
  const filtered = leads
    .filter((l) => filter === "all" ? true : stateOf(l) === filter)
    .filter((l) => !q || (l.name || "").toLowerCase().includes(q) || (l.source || "").toLowerCase().includes(q));

  const FBTN = (id, label, n) => (
    <button key={id} onClick={() => setFilter(id)} className="btn btn-sm"
      style={{ background: filter === id ? "var(--alloy-purple)" : "transparent", color: filter === id ? "#fff" : "var(--alloy-purple)", padding: "5px 11px" }}>
      {label}{n != null ? ` (${n})` : ""}
    </button>
  );

  return (
    <div className="content" data-screen-label="03 Leads">
      <TenureBanner />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <Stat label={`Qualified (${new Date().getFullYear()})`} value={counts.qualified} tone="#2c6e62" />
        <Stat label="Needs review" value={counts.review} tone="#b8881a" />
        <Stat label="Open pipeline" value={fmtMoney(pipeline) || "$0"} tone="var(--alloy-purple)" />
        <Stat label="Won / yr" value={fmtMoney(won) || "$0"} tone="var(--alloy-purple)" />
      </div>

      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--alloy-off-white)" }}>
          {FBTN("review", "Needs review", counts.review)}
          {FBTN("qualified", "Qualified", counts.qualified)}
          {FBTN("nofit", "Not a fit", counts.nofit)}
          {FBTN("all", "All", leads.length)}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px", minWidth: 180 }}>
            <I.Search width={14} height={14} style={{ color: "var(--fg-muted)", flexShrink: 0 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--fg)" }} />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "28px 18px", fontSize: 13, color: "var(--fg-muted)" }}>
            {leads.length === 0 ? "No leads yet." : filter === "review" ? "Nothing to review — you're all caught up." : "No leads here."}
          </div>
        ) : (
          <>
            {filtered.slice(0, RENDER_CAP).map((l) => <LeadRow key={l._k} lead={l} onSaved={onSaved} />)}
            {filtered.length > RENDER_CAP ? (
              <div style={{ padding: "16px", fontSize: 12.5, color: "var(--fg-muted)", textAlign: "center" }}>
                Showing {RENDER_CAP} of {filtered.length.toLocaleString("en-US")} — search to narrow.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 120, border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 16px", background: "#fff" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone, fontFamily: "var(--font-display)" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}

export { TicketsScreen, PlaybookScreen, LibraryScreen, RecognitionScreen, LeadsScreen };
