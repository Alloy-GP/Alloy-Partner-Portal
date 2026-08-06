import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { BadgeMedalSmall } from './screen-dashboard.jsx';
import TicketThread from './TicketThread.jsx';
import { zdList } from '../lib/zendesk.js';
import { guideForTags } from '../lib/guides.js';
import GuideModal from './GuideModal.jsx';
import { qualifyLead } from '../lib/leads.js';
import { supabase } from '../lib/supabase.js';

// Tickets, Playbook, Library, Recognition
const { useState: _useState2, useEffect: _useEffect2 } = React;
const useState = _useState2;
const useEffect = _useEffect2;

function TicketsScreen({ onNewsletter, onGoals }) {
  const [tickets, setTickets] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [filter, setFilter] = useState("mytasks");
  const [query, setQuery] = useState("");
  const [guideModal, setGuideModal] = useState(null); // guide reader popup

  const loadList = () => {
    zdList()
      .then((res) => {
        const list = (res && res.tickets) || [];
        setTickets(list);
        setActiveId((cur) => cur || (list[0] && list[0].id) || null);
      })
      .catch((e) => { setError(String(e.message || e)); setTickets([]); });
  };
  // Refetch when the VIEWED account changes (staff switching clients reuses
  // this mounted screen). Without this, the list stayed on the prior client's
  // tickets while the header relabeled — a cross-tenant leak. Reset state so no
  // stale ticket/detail from the old account lingers.
  useEffect(() => { setTickets(null); setActiveId(null); setError(""); loadList(); }, [DATA.account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 0, border: "1px solid var(--border-subtle)", borderRadius: 14, overflow: "hidden", background: "#fff", height: "calc(100dvh - 168px)", minHeight: 480 }}>
        {/* Left list */}
        <div style={{ borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", minHeight: 0 }}>
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
                {(() => {
                  const g = guideForTags(t.tags);
                  return g ? (
                    <span role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setGuideModal(g); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setGuideModal(g); } }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 9, padding: "4px 9px", borderRadius: 8, background: "var(--alloy-pink-tint)", color: "var(--alloy-pink)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      <I.Book width={12} height={12} /> {g.title}
                    </span>
                  ) : null;
                })()}
              </button>
            ))}
          </div>
        </div>
        {/* Right detail */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeId ? (
            <TicketThread id={activeId} onChanged={loadList} onNewsletter={onNewsletter} onGoals={onGoals} />
          ) : (
            <div style={{ padding: "40px 22px", fontSize: 13, color: "var(--fg-muted)" }}>
              {tickets === null ? "" : "Select a ticket to view the conversation."}
            </div>
          )}
        </div>
      </div>
      {guideModal ? <GuideModal guide={guideModal} onClose={() => setGuideModal(null)} /> : null}
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
// On-brand donut/source palette: aubergine, magenta, gold, blue, teal, lavender, dusty, grey.
const SOURCE_PALETTE = ["#381c4f", "#d9356e", "#e0a422", "#5b8fb0", "#4a9d8e", "#9a6ebd", "#c9789f", "#b6abc4"];

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  if (v <= 0) return "";
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${v.toLocaleString("en-US")}`;
};
const statusOf = (l) => l.quotable === "yes" ? "qualified" : l.quotable === "no" ? "notfit" : "review";
// "https://riseamg.com/quote/" → "riseamg.com/quote"
const prettyPage = (url) => { try { const u = new URL(url); return (u.hostname + u.pathname).replace(/\/$/, ""); } catch { return url; } };
// Form field names arrive machine-y ("your_message", "Type of Association *",
// "ZIP / Postal Code(Required)"). Tidy to a readable label.
const prettyField = (name) => {
  const s = String(name || "")
    .replace(/\(required\)/ig, "").replace(/\*/g, "")
    .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Field";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
};

// WhatConverts dumps the WHOLE form submission, with noise: contact-info
// duplicates (mapped fields), tracking URLs (Page URL / Campaign / GCLID), and
// checkbox option-dumps where name === value ("Commercial":"Commercial"). Keep
// only the meaningful answers — dropdown selections, unit counts, association
// type, "what brings you here", etc. — deduped.
const SKIP_FIELD_NAME = /^(e-?mail( address)?|phone( number)?|mobile|cell|fax|name|full name|first( name)?|last( name)?|your name|contact name|company name|community name|association name|page url|url|campaign|gclid|utm[_a-z]*|ip address|message|comments?|contact method|preferred contact( method)?|how did you hear( about us)?|how'd you hear|referral source|where did you hear)$/i;

// Pull the few qualifying facts worth showing right on the lead card (no need
// to open the panel): unit count, association/property type, board-member flag.
function keyFacts(fields) {
  if (!Array.isArray(fields)) return [];
  const find = (re) => { const f = fields.find((x) => re.test(String(x.name || ""))); return f ? String(f.value).trim() : null; };
  const out = [];
  const units = find(/units|how many units|# *of units/i);
  if (units) { const m = units.match(/\d[\d,]*/); out.push(m ? `${m[0]} units` : units); }
  const type = find(/type of association|association type|property type|community type/i);
  if (type) out.push(type);
  const board = find(/board member/i);
  if (board && /^(y|true|1|check)/i.test(board)) out.push("Board member ✓");
  return out;
}

// The 3 hero facts shown as cards atop the detail panel. Returns the cards plus
// the set of field names consumed, so the "What they submitted" list can show
// only the remaining answers (intent, timeline, etc.) without duplicating these.
function leadStatCards(fields) {
  const arr = Array.isArray(fields) ? fields : [];
  const used = new Set();
  // Returns the trimmed value (and marks the field consumed so it isn't repeated).
  const pick = (re) => { const f = arr.find((x) => !used.has(x.name) && re.test(String(x.name || ""))); if (f) { used.add(f.name); return String(f.value).trim(); } return null; };
  const cards = [];
  const units = pick(/units|how many units|# *of units/i);
  if (units) { const m = units.match(/\d[\d,]*/); cards.push({ label: "Units", value: m ? m[0] : units }); }
  const type = pick(/property type|type of association|association type|community type/i);
  if (type) cards.push({ label: "Property type", value: type });
  const situation = pick(/current situation|\bsituation\b|timeline|how soon|when.*(?:start|looking|need)|\bstage\b/i);
  if (situation) cards.push({ label: "Situation", value: situation });
  const board = pick(/board member|on the board/i);
  if (board) cards.push({ label: "Board member", value: board, good: /^(y|true|1|check)/i.test(board) });
  return { cards, used };
}
function cleanFields(l) {
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
  const digits = (s) => norm(s).replace(/[^0-9]/g, "");
  const emailV = norm(l.email), nameV = norm(l.name), companyV = norm(l.company), msgV = norm(l.message);
  const phoneD = digits(l.phone);
  const seen = new Set();
  return (Array.isArray(l.fields) ? l.fields : []).filter((f) => {
    if (!f || f.value == null) return false;
    const v = String(f.value).trim();
    if (!v || v.length >= 200) return false;
    if (/^https?:\/\//i.test(v)) return false;                 // tracking URLs
    const nm = String(f.name || "").trim();
    const nmKey = nm.replace(/\(required\)/ig, "").replace(/[*?:]/g, "").trim();
    if (norm(nm) === norm(v)) return false;                    // option-dump
    if (SKIP_FIELD_NAME.test(nmKey)) return false;             // contact / tracking dupes
    const nv = norm(v);
    if (nv === emailV || nv === nameV || nv === companyV) return false;
    if (msgV && nv === msgV) return false;                     // already shown as "Their message"
    if (phoneD && digits(v) === phoneD) return false;          // any phone dupe
    const key = norm(nmKey) + "=" + nv;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((f) => ({ name: f.name, value: String(f.value).trim() }));
}
const jDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };
const jPath = (url) => { try { const u = new URL(url); return (u.pathname.replace(/\/$/, "") || "/"); } catch { return url; } };

// Build the leads-page view model from real data (recentLeads + account rollup).
function buildLeadsPage() {
  const a = DATA.account || {};
  const raw = DATA.recentLeads || [];
  const year = new Date().getFullYear();
  const byYear = a.wcQualifiedByYear || {};

  // sources: share of this year's leads, top 6 + Other, brand colors.
  const counts = {};
  for (const l of raw) { const s = (l.source || "Direct").trim() || "Direct"; counts[s] = (counts[s] || 0) + 1; }
  const total = raw.length || 1;
  const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  const top = sorted.slice(0, 6);
  const tail = sorted.slice(6);
  if (tail.length) top.push(["Other", tail.reduce((s, [, n]) => s + n, 0)]);
  const sources = top.map(([name, n], i) => ({ name, pct: Math.round(n / total * 100), color: SOURCE_PALETTE[i % SOURCE_PALETTE.length] }));

  const list = raw.map((l, i) => ({
    id: l.id || `row-${i}`,
    person: l.name || "New lead",
    community: l.company || "",
    email: l.email || "",
    phone: l.phone || "",
    channel: l.type === "call" ? "call" : "form",
    source: l.source || "Direct",
    context: l.context || "",
    time: l.time || "",
    date: l.date || "",
    status: statusOf(l),
    reason: l.quotable === "no" ? (l.leadStatus || null) : null, // spam | duplicate | null (refines "not a fit")
    note: l.message || "",
    fields: cleanFields(l),
    facts: keyFacts(l.fields),
    page: l.page || "",
    journey: Array.isArray(l.journey) ? l.journey : null,
    monthly: Number(l.salesValue) || Number(l.quoteValue) || 0,   // monthly (pipeline)
    quote: Number(l.quoteValue) || 0,   // monthly, open
    sales: Number(l.salesValue) || 0,   // monthly, closed
    value: l.value || "",               // annualized display string
  }));

  return {
    year,
    stats: {
      paceLastYear: byYear[String(year - 1)] || 0,
      lifetimeQualified: a.wcQualifiedTotal || 0,
      totalThisYear: raw.length,
      firstLead: a.wcFirstLeadAt ? new Date(a.wcFirstLeadAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : (a.since || ""),
    },
    sources,
    list,
  };
}

function LdChannelIcon({ channel }) {
  return (
    <div className={`ld-chan ld-chan-${channel}`} title={channel === "call" ? "Phone call" : "Form fill"}>
      {channel === "call" ? <I.Phone width={15} height={15} /> : <I.Doc width={15} height={15} />}
    </div>
  );
}

function LeadsScreen() {
  const LD = React.useMemo(buildLeadsPage, []);
  const srcColor = (name) => (LD.sources.find((s) => s.name.toLowerCase() === String(name).toLowerCase()) || {}).color || "#c9c1d6";

  const [leads, setLeads] = useState(LD.list);
  const [tab, setTab] = useState("qualified");
  const [query, setQuery] = useState("");
  const [panelId, setPanelId] = useState(null);
  const [editQuote, setEditQuote] = useState("");   // monthly, free-form
  const [editSales, setEditSales] = useState("");   // monthly, free-form
  const [savedFlash, setSavedFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);
  const initialQualified = React.useRef(LD.list.filter((l) => l.status === "qualified").length);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Match the queue card's height to the right (proof) column so it flexes with
  // it; the queue's rows scroll inside. Desktop two-column layout only.
  const proofRef = React.useRef(null);
  const [queueH, setQueueH] = useState(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1001px)");
    const measure = () => setQueueH(mq.matches && proofRef.current ? proofRef.current.offsetHeight : null);
    measure();
    const ro = new ResizeObserver(measure);
    if (proofRef.current) ro.observe(proofRef.current);
    mq.addEventListener("change", measure);
    return () => { ro.disconnect(); mq.removeEventListener("change", measure); };
  }, []);

  const reviewLeads = leads.filter((l) => l.status === "review");
  const qualifiedLeads = leads.filter((l) => l.status === "qualified");
  const ytdQualified = qualifiedLeads.length;
  const pipelineMonthly = qualifiedLeads.reduce((s, l) => s + (Number(l.monthly) || 0), 0);
  const lifetime = LD.stats.lifetimeQualified + (ytdQualified - initialQualified.current);

  // Value breakdown (YTD, qualified leads only). A "won" qualified lead has a
  // sales value; an "open" one has a quote but no sale yet. Win rate = of all
  // qualified leads, the share that closed (have a sales value).
  const wonLeads = qualifiedLeads.filter((l) => Number(l.sales) > 0);
  const openLeads = qualifiedLeads.filter((l) => Number(l.quote) > 0 && !(Number(l.sales) > 0));
  const quoteAnnual = openLeads.reduce((s, l) => s + (Number(l.quote) || 0), 0) * 12;
  const salesAnnual = wonLeads.reduce((s, l) => s + (Number(l.sales) || 0), 0) * 12;
  // Win rate over VALUED leads only (signed + open quotes) — un-quoted qualified
  // leads don't drag it down.
  const valuedCount = wonLeads.length + openLeads.length;
  const winRate = valuedCount ? Math.round((wonLeads.length / valuedCount) * 100) : 0;

  const LdSourceChip = ({ lead }) => (
    <span className="ld-src-chip"><span className="swatch" style={{ background: srcColor(lead.source) }} />{lead.source}</span>
  );

  const quotableOf = (status) => status === "qualified" ? "yes" : status === "notfit" ? "no" : "pending";

  // status: qualified | review(=pending) | notfit. reason (notfit only): spam | duplicate | null.
  // "Not a fit", "Spam", "Duplicate" all set quotable="no"; reason distinguishes them.
  const REASON_LABEL = { spam: "spam", duplicate: "duplicate" };
  const setStatus = async (id, status, reason = null) => {
    const canonical = status === "pending" ? "review" : status;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const nextReason = canonical === "notfit" ? (reason || null) : null;
    const prev = { status: lead.status, reason: lead.reason || null };
    setLeads((ls) => ls.map((l) => l.id === id ? { ...l, status: canonical, reason: nextReason } : l));   // keep values across status
    const label = canonical === "qualified" ? `${lead.person} marked qualified`
      : canonical === "review" ? `${lead.person} moved to pending`
      : nextReason ? `${lead.person} marked ${REASON_LABEL[nextReason]}`
      : `${lead.person} marked not a fit`;
    setToast({ id, prev, label });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
    try { await qualifyLead(id, { quotable: quotableOf(canonical), leadStatus: nextReason }); } catch (e) { /* optimistic; next sync reconciles */ }
  };
  const undo = async () => {
    if (!toast) return;
    const t = toast;
    setLeads((ls) => ls.map((l) => l.id === t.id ? { ...l, status: t.prev.status, reason: t.prev.reason ?? null } : l));
    setToast(null);
    try { await qualifyLead(t.id, { quotable: quotableOf(t.prev.status), leadStatus: t.prev.reason ?? null }); } catch (e) { /* */ }
  };
  // Free-form value edit (monthly); persists regardless of status.
  const saveValues = async (id, quoteStr, salesStr) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const qv = quoteStr === "" ? 0 : Number(quoteStr) || 0;
    const sv = salesStr === "" ? 0 : Number(salesStr) || 0;
    const disp = (sv || qv) ? `$${((sv || qv) * 12).toLocaleString("en-US")}` : "";
    setLeads((ls) => ls.map((l) => l.id === id ? { ...l, quote: qv, sales: sv, monthly: sv || qv, value: disp } : l));
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
    try { await qualifyLead(id, { quotable: quotableOf(lead.status), quoteValue: qv, salesValue: sv }); } catch (e) { /* */ }
  };

  const tabs = [
    { id: "qualified", label: "Qualified", count: ytdQualified },
    { id: "notfit", label: "Not a fit", count: leads.filter((l) => l.status === "notfit").length },
    { id: "all", label: "All", count: leads.length },
  ];
  const q = query.trim().toLowerCase();
  const visible = leads.filter((l) => {
    if (tab !== "all" && l.status !== tab) return false;
    if (!q) return true;
    return [l.person, l.community, l.email, l.source, l.context].join(" ").toLowerCase().includes(q);
  });

  const panelLead = leads.find((l) => l.id === panelId);
  const panelStat = panelLead ? leadStatCards(panelLead.fields) : { cards: [], used: new Set() };
  // Free-text the rep should still see (e.g. "Anything else?") when there's no
  // dedicated message field — shown in the note area, not as a raw field dump.
  const panelFreeText = panelLead
    ? (panelLead.fields || []).find((f) => !panelStat.used.has(f.name) && /anything else|additional|comments?|\bnotes?\b|details|tell us|\bmessage\b/i.test(String(f.name || "")))
    : null;
  // Location (city, ZIP) rides up in the purple header next to name/community —
  // context, not a qualifying stat, so it doesn't earn a card.
  const findFld = (re) => (panelLead && Array.isArray(panelLead.fields) ? panelLead.fields.find((f) => re.test(String(f.name || ""))) : null);
  const ldCity = (findFld(/^\s*city\b/i) || {}).value || "";
  const ldZip = (findFld(/\bzip\b|postal/i) || {}).value || "";
  const ldLocation = [ldCity, ldZip].filter(Boolean).join(", ");

  // Lazy-load the heavy panel-only columns (journey, message) for the open lead —
  // they're excluded from the bulk load to keep page-load fast.
  const [heavy, setHeavy] = useState({}); // wc_lead_id -> { journey, note }
  useEffect(() => {
    if (!panelId || heavy[panelId]) return;
    let cancelled = false;
    supabase.from("leads").select("wc_lead_id, journey, message").eq("wc_lead_id", panelId).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setHeavy((h) => ({ ...h, [panelId]: { journey: Array.isArray(data.journey) ? data.journey : null, note: data.message || "" } }));
      });
    return () => { cancelled = true; };
  }, [panelId]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelHeavy = heavy[panelId] || null;
  const panelJourney = panelHeavy ? panelHeavy.journey : (panelLead && panelLead.journey) || null;
  const panelNote = panelHeavy ? panelHeavy.note : (panelLead && panelLead.note) || "";

  // Seed the free-form value inputs whenever a lead's panel opens.
  useEffect(() => {
    if (!panelLead) return;
    setEditQuote(panelLead.quote ? String(panelLead.quote) : "");
    setEditSales(panelLead.sales ? String(panelLead.sales) : "");
  }, [panelId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!panelId) return;
    const onKey = (e) => { if (e.key === "Escape") setPanelId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelId]);

  return (
    <div className="content" data-screen-label="03 Partnership">
      <div className="ld-top">
        {/* Review queue */}
        <div className="banner-card banner-pink ld-queue" style={queueH ? { height: queueH } : undefined}>
          <div className="banner-card-head">
            <span className="ld-queue-count">{reviewLeads.length}</span>
            <div className="bc-titles">
              <div className="bc-kicker">Partnership growth · Live</div>
              <div className="bc-title">{reviewLeads.length > 0 ? "Leads waiting on you" : "Lead review"}</div>
            </div>
          </div>
          <div className="banner-card-body">
            {reviewLeads.length === 0 ? (
              <div className="ld-queue-empty">
                <I.Check width={22} height={22} />
                Queue clear — every lead is triaged. New ones land here the moment they come in.
              </div>
            ) : (
              <div className="ld-queue-rows">
                {reviewLeads.map((l) => (
                  <div key={l.id} className="ld-queue-row ld-clickable" onClick={() => setPanelId(l.id)}>
                    <LdChannelIcon channel={l.channel} />
                    <div className="ld-who">
                      <div className="ld-who-name">{l.person}{l.community ? <span className="ld-comm"> · {l.community}</span> : null}</div>
                      <div className="ld-who-sub">
                        <LdSourceChip lead={l} />
                        {l.context ? <span className="ld-context">{l.context}</span> : null}
                        {l.date ? <><span className="sep">·</span><span>{jDate(l.date)}</span></> : null}
                      </div>
                      {l.facts && l.facts.length ? (
                        <div className="ld-facts">{l.facts.map((f, i) => <span key={i} className="ld-fact">{f}</span>)}</div>
                      ) : null}
                    </div>
                    <div className="ld-actions">
                      <button className="ld-btn-qualify ld-btn-qualnow" onClick={() => setPanelId(l.id)}>Qualify now</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Proof rail */}
        <div className="ld-proof" ref={proofRef}>
          <div className="ld-proof-card">
            <div className="ld-proof-kicker">Qualified leads · {LD.year}</div>
            <div className="ld-proof-hero">
              <span className="ld-proof-num">{ytdQualified}</span>
              {LD.stats.paceLastYear > 0 ? (
                <span className="ld-pace-pill"><I.TrendUp width={11} height={11} />{ytdQualified - LD.stats.paceLastYear >= 0 ? `${ytdQualified - LD.stats.paceLastYear} ahead of '${String(LD.year - 1).slice(2)} pace` : `${LD.stats.paceLastYear - ytdQualified} to match '${String(LD.year - 1).slice(2)}`}</span>
              ) : null}
            </div>
            {LD.stats.paceLastYear > 0 ? (
              <div className="ld-pace">
                <div className="ld-pace-row now">
                  <span className="yr">{LD.year}</span>
                  <span className="track"><span className="bar" style={{ width: "100%" }} /></span>
                  <span className="n">{ytdQualified}</span>
                </div>
                <div className="ld-pace-row then">
                  <span className="yr">{LD.year - 1}</span>
                  <span className="track"><span className="bar" style={{ width: `${ytdQualified ? Math.min(100, Math.round(LD.stats.paceLastYear / ytdQualified * 100)) : 0}%` }} /></span>
                  <span className="n">{LD.stats.paceLastYear}</span>
                </div>
              </div>
            ) : null}
            <div className="ld-proof-note"><I.Trophy width={12} height={12} />{lifetime.toLocaleString("en-US")} qualified all-time{LD.stats.firstLead ? ` · since ${LD.stats.firstLead}` : ""}</div>
          </div>

          <div className="ld-metrics">
            <div className="ld-metric">
              <button type="button" className="ld-info" aria-label="What counts as quote value" data-tip="Open pipeline — qualified leads with a quote value but no signed sale yet."><I.Info width={15} height={15} /></button>
              <div className="lbl"><span className="dot blue" />Quote value</div>
              <div className="num">{fmtMoney(quoteAnnual) || "$0"}<span className="per">/yr</span></div>
              <div className="sub up">from {openLeads.length} open {openLeads.length === 1 ? "lead" : "leads"}</div>
            </div>
            <div className="ld-metric">
              <button type="button" className="ld-info" aria-label="What counts as sales value" data-tip="Closed deals — qualified leads with a signed sales value."><I.Info width={15} height={15} /></button>
              <div className="lbl"><span className="dot green" />Sales value</div>
              <div className="num green">{fmtMoney(salesAnnual) || "$0"}<span className="per">/yr</span></div>
              <div className="sub up">from {wonLeads.length} {wonLeads.length === 1 ? "lead" : "leads"} in {LD.year}</div>
            </div>
            <div className="ld-metric ld-metric-wide">
              <button type="button" className="ld-info" aria-label="How win rate is calculated" data-tip="Signed ÷ valued leads (signed + open quotes). Excludes qualified leads with no quote value yet."><I.Info width={15} height={15} /></button>
              <div className="lbl"><span className="dot yellow" />Win rate</div>
              <div className="ld-winrate">
                <span className="pct">{winRate}%</span>
                <span className="track"><span className="bar" style={{ width: `${winRate}%` }} /></span>
                <span className="cap">{wonLeads.length} of {valuedCount} quotes signed</span>
              </div>
            </div>
          </div>

          <LdSources sources={LD.sources} total={LD.stats.totalThisYear} />
        </div>
      </div>

      {/* Full list */}
      <div className="ld-list-card">
        <div className="ld-list-bar">
          <div className="ld-tabs">
            {tabs.map((tb) => (
              <button key={tb.id} className={`ld-tab${tab === tb.id ? " active" : ""}${tb.attention ? " attention" : ""}`} onClick={() => setTab(tb.id)}>
                {tb.label} <span className="ct">{tb.count}</span>
              </button>
            ))}
          </div>
          <div className="ld-search">
            <I.Search width={14} height={14} />
            <input placeholder="Search name, community, source…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className="ld-rows">
          {visible.length === 0 ? (
            <div className="ld-empty-rows">{`No leads here${q ? " match your search" : ""}.`}</div>
          ) : visible.slice(0, RENDER_CAP).map((l) => (
            <div key={l.id} className="ld-row ld-clickable" onClick={() => setPanelId(l.id)}>
              <LdChannelIcon channel={l.channel} />
              <div className="ld-who">
                <div className="ld-who-name">{l.person}{l.community ? <span className="ld-comm"> · {l.community}</span> : null}</div>
                <div className="ld-who-sub">{l.email}</div>
              </div>
              <div className="ld-cell-src">
                <LdSourceChip lead={l} />
                {l.context ? <span className="ld-context">{l.context}</span> : null}
                {l.facts && l.facts.length ? (
                  <div className="ld-facts">{l.facts.map((f, i) => <span key={i} className="ld-fact">{f}</span>)}</div>
                ) : null}
              </div>
              <span className="ld-time">{l.date ? jDate(l.date) : l.time}</span>
              <div className="ld-cell-status" onClick={(e) => e.stopPropagation()}>
                {l.status === "review" ? (
                  <>
                    <span className="tag tag-status-progress ld-hover-hide"><span className="dot" />Pending</span>
                    <div className="ld-hover-actions">
                      <button className="ld-btn-qualify" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => setStatus(l.id, "qualified")}><I.Check width={11} height={11} /></button>
                      <button className="ld-btn-notfit" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => setStatus(l.id, "notfit")}><I.Close width={10} height={10} /></button>
                    </div>
                  </>
                ) : l.status === "qualified" ? (
                  <>
                    {l.value ? <span className="ld-value">{l.value}<span className="per">/yr</span></span>
                      : <button className="ld-add-value" onClick={() => setPanelId(l.id)}><I.Plus width={10} height={10} /> Est. value</button>}
                    <span className="tag tag-status-live"><span className="dot" />Qualified</span>
                  </>
                ) : (
                  <span className="tag tag-status-done"><span className="dot" />{l.reason === "spam" ? "Spam" : l.reason === "duplicate" ? "Duplicate" : "Not a fit"}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="ld-list-foot">
          <span>Showing {Math.min(visible.length, RENDER_CAP)} of {visible.length.toLocaleString("en-US")} · {LD.stats.totalThisYear.toLocaleString("en-US")} leads this year</span>
        </div>
      </div>

      {/* Detail panel */}
      {panelLead ? (
        <>
          <div className="ld-panel-scrim" onClick={() => setPanelId(null)} />
          <aside className="ld-panel" role="dialog" aria-label="Lead detail">
            <div className="ld-panel-head">
              <div className="ld-panel-head-top">
                <div className="ld-panel-id">
                  <div className="ttl">{panelLead.person}</div>
                  <div className="sub">{panelLead.community || panelLead.source}</div>
                  {(ldLocation || panelLead.email || panelLead.phone) ? (
                    <div className="ld-panel-meta">
                      {[
                        ldLocation || null,
                        panelLead.email ? <a key="em" href={`mailto:${panelLead.email}`}>{panelLead.email}</a> : null,
                        panelLead.phone ? <a key="ph" href={`tel:${String(panelLead.phone).replace(/[^0-9+]/g, "")}`}>{panelLead.phone}</a> : null,
                      ].filter(Boolean).map((part, i, arr) => (
                        <span className="mp" key={i}>{part}{i < arr.length - 1 ? <span className="sep"> · </span> : null}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="ld-panel-close" onClick={() => setPanelId(null)} aria-label="Close"><I.Close width={13} height={13} /></button>
              </div>
              <div className="ld-status-seg">
                <button className={`ld-seg-btn yes${panelLead.status === "qualified" ? " on" : ""}`} onClick={() => setStatus(panelLead.id, "qualified")}>{panelLead.status === "qualified" ? <I.Check width={12} height={12} /> : null}Qualified</button>
                <button className={`ld-seg-btn pend${panelLead.status === "review" ? " on" : ""}`} onClick={() => setStatus(panelLead.id, "pending")}>{panelLead.status === "review" ? <I.Check width={12} height={12} /> : null}Pending</button>
                <button className={`ld-seg-btn no${panelLead.status === "notfit" && !panelLead.reason ? " on" : ""}`} onClick={() => setStatus(panelLead.id, "notfit", null)}>{panelLead.status === "notfit" && !panelLead.reason ? <I.Check width={12} height={12} /> : null}Not a fit</button>
                <button className={`ld-seg-btn spam${panelLead.status === "notfit" && panelLead.reason === "spam" ? " on" : ""}`} onClick={() => setStatus(panelLead.id, "notfit", "spam")}>{panelLead.status === "notfit" && panelLead.reason === "spam" ? <I.Check width={12} height={12} /> : null}Spam</button>
                <button className={`ld-seg-btn dup${panelLead.status === "notfit" && panelLead.reason === "duplicate" ? " on" : ""}`} onClick={() => setStatus(panelLead.id, "notfit", "duplicate")}>{panelLead.status === "notfit" && panelLead.reason === "duplicate" ? <I.Check width={12} height={12} /> : null}Duplicate</button>
              </div>
            </div>
            <div className="ld-panel-body">
              {panelStat.cards.length ? (
                <div className="ld-stat-cards">
                  {panelStat.cards.map((c, i) => (
                    <div className="ld-stat-card" key={i}>
                      <div className="lbl">{c.label}</div>
                      <div className={`val${c.good ? " good" : ""}${String(c.value).length > 4 ? " txt" : ""}`}>{c.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="ld-panel-sec">
                <div className="ld-val-edit">
                  <label className="ld-val-field">
                    <span className="ld-val-lbl">Quote · open</span>
                    <span className="ld-money"><span className="u">$</span><input value={editQuote} onChange={(e) => setEditQuote(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" /><span className="u">/mo</span></span>
                    <span className="ld-val-ann">{editQuote ? `= $${(Number(editQuote) * 12).toLocaleString("en-US")}/yr` : "\u00a0"}</span>
                  </label>
                  <label className="ld-val-field">
                    <span className="ld-val-lbl">Sales · closed</span>
                    <span className="ld-money"><span className="u">$</span><input value={editSales} onChange={(e) => setEditSales(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" /><span className="u">/mo</span></span>
                    <span className="ld-val-ann">{editSales ? `= $${(Number(editSales) * 12).toLocaleString("en-US")}/yr` : "\u00a0"}</span>
                  </label>
                  <button className="ld-val-save" onClick={() => saveValues(panelLead.id, editQuote, editSales)}>{savedFlash ? "Saved" : "Save value"}</button>
                </div>
              </div>
              {(panelNote || panelFreeText) ? (
                <div className="ld-panel-sec">
                  <div className="sec-lbl">{panelLead.channel === "call" ? "Call summary" : (panelNote ? "Their message" : prettyField(panelFreeText.name))}</div>
                  <div className="ld-panel-note">{panelNote || panelFreeText.value}</div>
                </div>
              ) : null}
              <div className="ld-panel-sec">
                <div className="sec-lbl">Customer journey</div>
                {panelJourney && panelJourney.length ? (
                  <LeadJourney steps={panelJourney} context={panelLead.context} />
                ) : (
                  <div className="ld-journey">
                    <div className="step"><span className="dot" /><span className="tx"><b>{panelLead.source}</b>{panelLead.context ? ` — ${panelLead.context}` : ""}</span></div>
                    <div className="step"><span className="dot" /><span className="tx">{panelLead.channel === "call" ? "Called your tracked number" : "Filled out your contact form"}{panelLead.time ? ` · ${panelLead.time}` : ""}</span></div>
                    {panelLead.page ? (
                      <div className="step"><span className="dot" /><span className="tx">On <a className="ld-page-link" href={panelLead.page} target="_blank" rel="noreferrer">{prettyPage(panelLead.page)}</a></span></div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {/* Undo toast */}
      {toast ? (
        <div className="ld-toast" role="status">
          <span>{toast.label}</span>
          <button className="ld-undo" onClick={undo}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}

function LeadJourney({ steps, context }) {
  const visits = steps.filter((s) => s.type === "visit").length;
  const inquiries = steps.filter((s) => s.type === "lead").length;
  const CAP = 12;
  const ordered = [...steps].reverse().slice(0, CAP);   // newest first
  return (
    <>
      <div className="ld-journey-sum">{visits} visit{visits !== 1 ? "s" : ""} · {inquiries} inquir{inquiries !== 1 ? "ies" : "y"}{steps.length > CAP ? ` · latest ${CAP} shown` : ""}</div>
      <div className="ld-journey">
        {ordered.map((s, idx) => s.type === "lead" ? (
          <div key={idx} className="step lead"><span className="dot" /><span className="tx">
            <b>Inquiry submitted</b> <span className="ld-jt-date">{jDate(s.date)}</span>
            {context ? <span className="ld-journey-pages"><span className="pg">{context}</span></span> : null}
          </span></div>
        ) : (
          <div key={idx} className="step"><span className="dot" /><span className="tx">
            <b>{s.source || "Direct"}</b>{s.medium && s.medium !== "(none)" && s.medium !== "(not set)" ? ` · ${s.medium}` : ""} <span className="ld-jt-date">{jDate(s.date)}</span>
            {s.pages && s.pages.length ? (
              <span className="ld-journey-pages">
                {s.pages.slice(0, 6).map((pp, k) => <span key={k} className="pg">{jPath(pp)}</span>)}
                {s.pages.length > 6 ? <span className="pg more">+{s.pages.length - 6}</span> : null}
              </span>
            ) : null}
          </span></div>
        ))}
        <div className="step muted"><span className="dot" /><span className="tx">Captured by your website {"→"} routed here</span></div>
      </div>
    </>
  );
}

function LdSources({ sources, total }) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(null);
  if (!sources.length) return null;
  const shown = expanded ? sources : sources.slice(0, 3);
  const rest = sources.length - 3;
  return (
    <div className="ld-proof-card">
      <div className="ld-proof-kicker" style={{ color: "var(--fg-muted)" }}>Where leads come from</div>
      <div className="ld-src-total"><b style={{ color: "var(--alloy-purple)", fontFamily: "var(--font-display)", fontSize: 15 }}>{total.toLocaleString("en-US")}</b> leads this year</div>
      <div className="ld-src-bar">
        {sources.map((s) => (
          <span key={s.name} className={`seg${hover && hover !== s.name ? " dim" : ""}`}
            style={{ width: `${s.pct}%`, background: s.color }}
            onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)} title={`${s.name} · ${s.pct}%`} />
        ))}
      </div>
      <div className="ld-src-legend">
        {shown.map((s) => (
          <div key={s.name} className="ld-src-line" onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)}>
            <span className="swatch" style={{ background: s.color }} />
            <span className="nm">{s.name}</span>
            <span className="pct">{s.pct}%</span>
          </div>
        ))}
        {rest > 0 ? <button className="ld-src-more" onClick={() => setExpanded((e) => !e)}>{expanded ? "Show less" : `+ ${rest} more sources`}</button> : null}
      </div>
    </div>
  );
}

export { TicketsScreen, PlaybookScreen, LibraryScreen, RecognitionScreen, LeadsScreen };
