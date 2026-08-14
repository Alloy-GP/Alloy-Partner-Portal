import React from 'react';
import { getLeads, enrichLead } from '../lib/proposalMockData.js';
import { COLORS, buildSubmission } from '../lib/boardData.js';
import { camFor, DEFAULT_CAM } from '../lib/camProfiles.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

// ============================================================================
// Board-facing proposal document (Direction 3 · Interactive) — the white-labeled
// page the HOA board reads (ported from board/proposal-exp.jsx). The CAM identity
// (name, logo, contact, team, tiers, onboarding, UVPs, prose) comes from the
// account's profile via camFor(lead.accountId) → CamCtx; see camProfiles.js.
//
// Renders from the SAME enriched lead data the Review screen uses — the lead's
// `concerns` (label/headline/body/proof/metric/caps), `links`, `match`,
// `capsMatched`/`capsTotal`, `gapNote` (the LLM/engine output). So Review →
// Build → board doc → Close all show one consistent example. UVP `caps` are
// indices into the CAM's UVP library (cam.uvps — same array the matcher derived
// against), which supplies the per-cap title/body/icon shown on each concern.
//
// Self-contained inline styles via COLORS (NOT the .proposal-system scoped CSS).
// Driven by any lead; shown in the Build preview iframe and at /proposals/board/:id.
// ============================================================================

const { useState, useRef, useEffect, useLayoutEffect, useMemo, useContext } = React;
const c = COLORS;

// The white-label CAM identity for the proposal being viewed, provided by
// BoardProposal (resolved from lead.accountId) and read by every sub-component.
const CamCtx = React.createContext(DEFAULT_CAM);
const useCam = () => useContext(CamCtx);

// The proposal's assigned rep (owner initials → who reaches out to the board),
// per the account's CAM. Falls back to a generic "Your <CAM> lead".
const repOf = (owner, cam) => (cam && cam.reps && cam.reps[owner]) || { name: `Your ${cam?.shortName || 'team'} lead`, first: `Your ${cam?.shortName || 'team'} lead`, role: 'Client Partnerships' };

// The proof-point value is sometimes a tight stat ("97%", "Day 30", "Monthly")
// and sometimes a multi-word phrase the matcher returns ("In-house maintenance",
// "Full pod model"). Render stats big; render phrases smaller and wrapping so
// they never blow out the box (the mobile card clips overflow → text cut off).
const proofIsStat = (v) => String(v || '').trim().length <= 8;

// ---------- atoms ----------
function AccentBar({ height = 6 }) {
  return (
    <div style={{ display: 'flex', height, width: '100%', flexShrink: 0 }}>
      <div style={{ flex: 1, background: c.cmgtGreen }} /><div style={{ flex: 1, background: c.greenTint }} /><div style={{ flex: 1, background: c.cmgtSoft }} /><div style={{ flex: 1, background: c.purple90 }} /><div style={{ flex: 1, background: c.purple }} />
    </div>
  );
}
function Eyebrow({ children, color = c.pink, style = {} }) {
  return <div style={{ fontFamily: 'Gotham, Poppins, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color, ...style }}>{children}</div>;
}
function Button({ variant = 'primary', children, onClick, style = {}, disabled, size = 'md' }) {
  const base = { fontFamily: 'Gotham, Poppins, sans-serif', fontWeight: 700, fontSize: size === 'sm' ? 11 : 13, letterSpacing: '0.10em', textTransform: 'uppercase', padding: size === 'sm' ? '9px 16px' : '13px 24px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 180ms cubic-bezier(0.2,0.8,0.2,1)', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' };
  const variants = {
    primary: { background: c.pink, color: '#fff', boxShadow: '0 6px 18px rgba(61,26,82,0.25)' },
    ghost: { background: 'transparent', color: c.purple, padding: size === 'sm' ? '7px 10px' : '11px 14px', letterSpacing: '0.06em' },
    danger: { background: '#fff', color: c.pink, border: `2px solid ${c.pink}`, padding: size === 'sm' ? '7px 14px' : '11px 22px' },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }} onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(0)'; }}>{children}</button>;
}
export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.6, style = {} }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'arrow-right': return <svg {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case 'check': return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>;
    case 'x': return <svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    case 'shield-check': return <svg {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'monitor': return <svg {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
    case 'phone': return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case 'trending-up': return <svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>;
    case 'heart-handshake': return <svg {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="m12 15-3-3a1.74 1.74 0 0 1 0-2.5l1-1" /></svg>;
    case 'users': return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'clipboard-check': return <svg {...p}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>;
    case 'git-branch': return <svg {...p}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>;
    case 'workflow': return <svg {...p}><rect x="3" y="3" width="8" height="6" rx="1" /><rect x="13" y="15" width="8" height="6" rx="1" /><path d="M7 9v3a2 2 0 0 0 2 2h6" /></svg>;
    case 'user-check': return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>;
    case 'scale': return <svg {...p}><path d="M6 21h12" /><path d="M12 21V7" /><path d="m17 4-5 3-5-3" /><path d="m3 14 4-7 4 7" /><path d="m13 14 4-7 4 7" /></svg>;
    case 'home': return <svg {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
    case 'sparkles': return <svg {...p}><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>;
    case 'message-square': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}
function CAMLogo({ scheme = 'light', size = 'md' }) {
  const cam = useCam();
  const h = { sm: 22, md: 30, lg: 44 }[size];
  if (cam.logo) {
    const src = scheme === 'dark' ? (cam.logo.dark || cam.logo.light) : cam.logo.light;
    return <img src={src} alt={cam.name} style={{ height: h, display: 'block' }} />;
  }
  // No logo asset → a clean text wordmark (demo / white-label CAMs).
  return <span style={{ fontFamily: 'Gotham, Poppins, sans-serif', fontWeight: 800, fontSize: Math.round(h * 0.6), letterSpacing: '-0.01em', color: scheme === 'dark' ? '#fff' : c.purple, lineHeight: 1, display: 'block', whiteSpace: 'nowrap' }}>{cam.shortName}</span>;
}

function GlobalStyles() {
  return <style>{`
    @keyframes bp-fadeUp { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
    .bp-root { font-family: "Gotham","Poppins",system-ui,sans-serif; color: ${c.purple}; -webkit-font-smoothing: antialiased; }
    .bp-root *, .bp-root *::before, .bp-root *::after { box-sizing: border-box; }
    .bp-root ::selection { background: ${c.pink}; color: #fff; }
    /* ── Mobile: the board doc is a desktop grid layout; reflow to one column ── */
    @media (max-width: 768px) {
      .bp-root [data-section="How this was built"],
      .bp-root [data-section="Pricing tiers"],
      .bp-root [data-section="Your team"],
      .bp-root [data-section="First 90 days"],
      .bp-root [data-section="Discovery call CTA"] { padding-left:22px !important; padding-right:22px !important; padding-top:44px !important; padding-bottom:44px !important; }
      .bp-root [data-section="Concerns"] { padding:30px 22px 44px !important; }
      .bp-root h1 { font-size:28px !important; line-height:1.12 !important; }
      .bp-root h2 { font-size:23px !important; line-height:1.16 !important; }
      .bp-cover { grid-template-columns:1fr !important; gap:22px !important; padding:30px 22px 36px !important; }
      .bp-score { min-width:0 !important; max-width:100% !important; width:100% !important; }
      .bp-concerns { grid-template-columns:1fr !important; gap:22px !important; }
      .bp-built-head { flex-direction:column !important; align-items:flex-start !important; gap:14px !important; }
      .bp-team { grid-template-columns:1fr 1fr !important; }
      .bp-tiers { grid-template-columns:1fr !important; }
      .bp-pricedetail { grid-template-columns:1fr !important; gap:22px !important; padding:24px !important; }
      .bp-foot { grid-template-columns:1fr !important; gap:24px !important; }
      .bp-bar { flex-wrap:wrap !important; padding:12px 16px !important; gap:10px 12px !important; }
    }
    @media (max-width: 420px) { .bp-root .bp-team { grid-template-columns:1fr !important; } }
  `}</style>;
}

// ---------- document pieces (driven by the lead's LLM concerns) ----------
function ScoreCard({ lead }) {
  const pct = lead.match;
  const remainder = 100 - pct;
  return (
    <div className="bp-score" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '20px 22px', backdropFilter: 'blur(10px)', minWidth: 280, maxWidth: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" style={{ width: 72, height: 72, transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={c.green} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct} 100`} pathLength="100" style={{ transition: 'stroke-dasharray 800ms cubic-bezier(.2,.8,.2,1)' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 20, color: '#fff' }}>{pct}<span style={{ fontSize: 12, opacity: 0.65 }}>%</span></div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: c.yellow, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Match score</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>{pct >= 85 ? 'Strong fit' : pct >= 65 ? 'Good fit' : 'Partial fit'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{lead.capsMatched} of {lead.capsTotal} capabilities relevant</div>
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 }}><strong style={{ color: c.green }}>The other {remainder}%.</strong> {lead.gapNote}</div>
    </div>
  );
}

function PainRail({ concerns, activeIndex, onSelect }) {
  const cam = useCam();
  return (
    <div style={{ position: 'sticky', top: 18, alignSelf: 'start' }}>
      <Eyebrow color={c.pink}>Your concerns</Eyebrow>
      <div style={{ fontSize: 12, color: c.fgMuted, marginTop: 6, marginBottom: 14, lineHeight: 1.55 }}>Click any to see how {cam.shortName} addresses it.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {concerns.map((concern, i) => {
          const on = i === activeIndex;
          const matchCount = concern.caps.length;
          return (
            <button key={i} onClick={() => onSelect(i)} style={{ appearance: 'none', cursor: 'pointer', textAlign: 'left', border: 'none', background: on ? '#fff' : 'transparent', borderLeft: `3px solid ${on ? c.pink : 'transparent'}`, padding: '12px 14px', borderRadius: on ? '0 8px 8px 0' : 8, boxShadow: on ? '0 2px 6px rgba(56,28,79,.06)' : 'none', transition: 'all 160ms ease', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: 999, background: on ? c.pink : c.lightGray, color: on ? '#fff' : c.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: c.purple, lineHeight: 1.35 }}>{concern.label}</div>
                <div style={{ fontSize: 10, color: c.fgMuted, marginTop: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{matchCount} matched cap{matchCount !== 1 && 's'}</div>
              </div>
              {on && <Icon name="arrow-right" size={14} color={c.pink} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnswerPanel({ concern, index, total, onNext }) {
  const cam = useCam();
  if (!concern) return null;
  const caps = concern.caps.map((i) => cam.uvps[i]).filter(Boolean);
  return (
    <div key={index} style={{ background: '#fff', borderRadius: 14, padding: 40, border: `1px solid ${c.lightGray}`, boxShadow: '0 2px 8px rgba(56,28,79,.05)', animation: 'bp-fadeUp 320ms cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 11, color: c.fgMuted, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Concern {index + 1} of {total}</div>
          <div style={{ fontSize: 14, color: c.bodyGray, fontStyle: 'italic', marginTop: 8, maxWidth: 540 }}>"{concern.label}"</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onNext}>Next concern <Icon name="arrow-right" size={12} /></Button>
      </div>
      <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 34, color: c.purple, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: '-0.02em' }}>{concern.headline}</h2>
      <p style={{ fontSize: 16, color: c.bodyGray, lineHeight: 1.7, margin: '0 0 28px', maxWidth: 620, fontWeight: 400 }}>{concern.body}</p>
      {concern.metric && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '22px 24px', background: c.purple, color: '#fff', borderRadius: 12, marginBottom: 28 }}>
          <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 900, fontSize: proofIsStat(concern.metric.value) ? 48 : 24, color: c.yellow, lineHeight: proofIsStat(concern.metric.value) ? 1 : 1.15, letterSpacing: '-0.02em', flexShrink: 1, minWidth: 0, overflowWrap: 'break-word' }}>{concern.metric.value}</div>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proof point</div>
            <div style={{ fontSize: 14, color: '#fff', fontWeight: 500, marginTop: 4 }}>{concern.metric.label || concern.proof}</div>
          </div>
        </div>
      )}
      <div>
        <Eyebrow color={c.pink}>Capabilities applied to this concern</Eyebrow>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {caps.map((u) => (
            <div key={u.id} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: c.offWhite, borderRadius: 8, alignItems: 'flex-start' }}>
              <Icon name={u.icon} size={18} color={c.pink} style={{ marginTop: 2, flexShrink: 0 }} />
              <div><div style={{ fontSize: 14, fontWeight: 700, color: c.purple, marginBottom: 4 }}>{u.title}</div><div style={{ fontSize: 13, color: c.bodyGray, lineHeight: 1.55 }}>{u.body}</div></div>
            </div>
          ))}
          {caps.length === 0 && <div style={{ fontSize: 13, color: c.fgMuted, fontStyle: 'italic', padding: 12 }}>No direct UVP match — addressed through general operational rigor.</div>}
        </div>
      </div>
    </div>
  );
}

function EngineGraph({ concerns }) {
  const cam = useCam();
  const wrapRef = useRef(null);
  const [W, setW] = useState(900);
  const [active, setActive] = useState(null);
  useEffect(() => { const measure = () => { if (wrapRef.current) setW(wrapRef.current.offsetWidth); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  const capList = useMemo(() => { const set = []; concerns.forEach((c2) => c2.caps.forEach((i) => { if (!set.includes(i)) set.push(i); })); return set; }, [concerns]);
  const pains = concerns.map((c2) => c2.label);
  const uvps = capList.map((i) => ({ i, title: (cam.uvps[i]?.title || '').split('—')[0].trim() }));
  const n = pains.length, m = uvps.length, rowH = 50, padTop = 16, H = Math.max(n, m) * rowH + 28, usableH = H - padTop * 2;
  const yL = (i) => padTop + (usableH * (i + 0.5)) / n;
  const yR = (i) => padTop + (usableH * (i + 0.5)) / m;
  const dotLX = W * 0.40, dotRX = W * 0.60;
  const pairs = [];
  concerns.forEach((c2, ci) => c2.caps.forEach((cap) => { const ui = capList.indexOf(cap); if (ui >= 0) pairs.push([ci, ui]); }));
  const isLinkOn = (pi, ui) => active && (active.side === 'l' ? active.i === pi : active.i === ui);
  const painOn = (pi) => active && (active.side === 'l' ? active.i === pi : concerns[pi].caps.includes(capList[active.i]));
  const uvpOn = (ui) => active && (active.side === 'r' ? active.i === ui : concerns[active.i].caps.includes(capList[ui]));
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.yellow, width: '40%' }}>Your concerns</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.green, textAlign: 'right', width: '40%' }}>{cam.shortName} capabilities</span>
      </div>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {pairs.map(([pi, ui], k) => { const on = isLinkOn(pi, ui), dim = active && !on; return <path key={k} d={`M ${dotLX} ${yL(pi)} C ${(dotLX + dotRX) / 2} ${yL(pi)}, ${(dotLX + dotRX) / 2} ${yR(ui)}, ${dotRX} ${yR(ui)}`} fill="none" stroke={on ? '#aee5b0' : c.green} strokeWidth={on ? 2.2 : 1.2} opacity={dim ? 0.12 : on ? 0.95 : 0.5} style={{ transition: 'all 0.18s' }} />; })}
        </svg>
        {pains.map((label, i) => (
          <React.Fragment key={'l' + i}>
            <div onMouseEnter={() => setActive({ side: 'l', i })} onMouseLeave={() => setActive(null)} style={{ position: 'absolute', top: yL(i), left: 0, width: dotLX - 16, transform: 'translateY(-50%)', textAlign: 'right', fontFamily: 'Gotham, sans-serif', fontSize: 13, fontWeight: 500, lineHeight: 1.25, color: painOn(i) ? c.yellow : '#fff', cursor: 'pointer', opacity: active && !painOn(i) ? 0.3 : 1, transition: 'all 0.18s' }}>{label}</div>
            <span style={{ position: 'absolute', top: yL(i), left: dotLX, width: 9, height: 9, borderRadius: 999, background: c.yellow, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 3px rgba(245,216,128,0.18)', opacity: active && !painOn(i) ? 0.3 : 1, transition: 'all 0.18s' }} />
          </React.Fragment>
        ))}
        {uvps.map((u, i) => (
          <React.Fragment key={'r' + i}>
            <span style={{ position: 'absolute', top: yR(i), left: dotRX, width: 9, height: 9, borderRadius: 999, background: c.green, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 3px rgba(116,194,117,0.18)', opacity: active && !uvpOn(i) ? 0.3 : 1, transition: 'all 0.18s' }} />
            <div onMouseEnter={() => setActive({ side: 'r', i })} onMouseLeave={() => setActive(null)} style={{ position: 'absolute', top: yR(i), left: dotRX + 16, width: W - dotRX - 20, transform: 'translateY(-50%)', fontFamily: 'Gotham, sans-serif', fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: uvpOn(i) ? '#fff' : 'rgba(255,255,255,0.92)', cursor: 'pointer', opacity: active && !uvpOn(i) ? 0.3 : 1, transition: 'all 0.18s' }}>{u.title}</div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <span><strong style={{ color: c.yellow }}>{pains.length}</strong> concerns raised</span>
        <span><strong style={{ color: c.green }}>{uvps.length}</strong> capabilities matched</span>
        <span><strong style={{ color: '#fff' }}>{pairs.length}</strong> connections drawn</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>Hover a node to trace its matches</span>
      </div>
    </div>
  );
}

// ── Mobile variants (handoff #25) ──────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth <= bp : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth <= bp);
    f(); window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [bp]);
  return m;
}

// The answer content of a concern, sans the desktop card chrome — used inside
// the mobile accordion (the summary already carries the concern label).
function AccordionBody({ concern }) {
  const cam = useCam();
  const caps = concern.caps.map((i) => cam.uvps[i]).filter(Boolean);
  return (
    <div>
      {concern.headline && <h3 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 21, color: c.purple, lineHeight: 1.2, margin: '2px 0 12px', letterSpacing: '-0.01em' }}>{concern.headline}</h3>}
      <p style={{ fontSize: 14.5, color: c.bodyGray, lineHeight: 1.65, margin: '0 0 18px' }}>{concern.body}</p>
      {concern.metric && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: c.purple, color: '#fff', borderRadius: 12, marginBottom: 18 }}>
          <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 900, fontSize: proofIsStat(concern.metric.value) ? 32 : 17, color: c.yellow, lineHeight: proofIsStat(concern.metric.value) ? 1 : 1.2, flexShrink: 1, minWidth: 0, overflowWrap: 'break-word' }}>{concern.metric.value}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proof point</div><div style={{ fontSize: 13, color: '#fff', fontWeight: 500, marginTop: 3 }}>{concern.metric.label || concern.proof}</div></div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: c.pink, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>How we answer it</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {caps.map((u) => (
          <div key={u.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: c.offWhite, borderRadius: 8, alignItems: 'flex-start' }}>
            <Icon name={u.icon} size={16} color={c.pink} style={{ marginTop: 2, flexShrink: 0 }} />
            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: c.purple, marginBottom: 3 }}>{u.title}</div><div style={{ fontSize: 12.5, color: c.bodyGray, lineHeight: 1.5 }}>{u.body}</div></div>
          </div>
        ))}
        {caps.length === 0 && <div style={{ fontSize: 12.5, color: c.fgMuted, fontStyle: 'italic', padding: 10 }}>Addressed through general operational rigor.</div>}
      </div>
    </div>
  );
}

// Mobile concerns = vertical accordion: tap a concern, its full answer expands
// inline. Replaces the desktop PainRail + AnswerPanel.
function ConcernAccordion({ concerns }) {
  const [open, setOpen] = useState(0);
  const itemRefs = useRef({});
  const mounted = useRef(false);
  const clickTop = useRef(null); // clicked header's viewport-top at click time
  // Opening a concern should glide its header to the top of the screen. The
  // catch: opening one collapses the previously-open card, and if that card was
  // ABOVE this one, its body unmounts and yanks this card upward in a single
  // un-animated jump — then the smooth scroll animates from that yanked spot, so
  // it reads as "scroll backwards, then settle." Fix in useLayoutEffect (before
  // paint): first cancel the yank instantly so the header stays exactly under
  // the user's finger, THEN smooth-scroll it to the top as one clean motion.
  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (open < 0) return;
    const el = itemRefs.current[open];
    if (!el) return;
    const prev = clickTop.current;
    if (prev != null) {
      const delta = el.getBoundingClientRect().top - prev; // how far the collapse yanked it
      if (delta) window.scrollBy(0, delta);                 // instant (pre-paint) — header stays put
      clickTop.current = null;
    }
    window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 14, behavior: 'smooth' });
  }, [open]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {concerns.map((concern, i) => {
        const isOpen = open === i;
        const matchCount = concern.caps.length;
        return (
          <div key={i} ref={(el) => { itemRefs.current[i] = el; }} style={{ border: `1px solid ${isOpen ? c.pink : c.lightGray}`, borderRadius: 14, background: '#fff', overflow: 'hidden', boxShadow: isOpen ? '0 8px 22px -12px rgba(217,53,110,.45)' : '0 2px 8px rgba(56,28,79,.05)', transition: 'border-color .18s, box-shadow .18s' }}>
            <button onClick={() => { if (!isOpen) { const cur = itemRefs.current[i]; clickTop.current = cur ? cur.getBoundingClientRect().top : null; } setOpen(isOpen ? -1 : i); }} style={{ appearance: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: 999, background: isOpen ? c.pink : c.lightGray, color: isOpen ? '#fff' : c.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.purple, lineHeight: 1.3 }}>{concern.label}</div>
                <div style={{ fontSize: 10, color: c.fgMuted, marginTop: 3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{matchCount} matched cap{matchCount !== 1 && 's'}</div>
              </div>
              <span style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: isOpen ? c.pink : c.fgMuted, display: 'inline-flex' }}><Icon name="arrow-right" size={16} /></span>
            </button>
            {isOpen && <div style={{ padding: '0 16px 18px' }}><AccordionBody concern={concern} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// Mobile matching engine = stacked list (the bipartite SVG is unreadable on a
// phone): one card per concern + its matched capabilities below a divider.
function EngineList({ concerns }) {
  const cam = useCam();
  const capSet = []; concerns.forEach((c2) => c2.caps.forEach((i) => { if (!capSet.includes(i)) capSet.push(i); }));
  const connections = concerns.reduce((a, c2) => a + c2.caps.length, 0);
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {concerns.map((c2, i) => {
          const caps = c2.caps.map((ci) => cam.uvps[ci]).filter(Boolean);
          return (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: c.yellow, marginTop: 5, flexShrink: 0, boxShadow: '0 0 0 3px rgba(245,216,128,0.18)' }} />
                <div style={{ fontFamily: 'Gotham, sans-serif', fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{c2.label}</div>
              </div>
              {caps.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {caps.map((u) => (
                    <div key={u.id} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                      <span style={{ width: 14, height: 1, background: c.green, flexShrink: 0 }} />
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: c.green, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Gotham, sans-serif', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.3 }}>{(u.title || '').split('—')[0].trim()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span><strong style={{ color: c.yellow }}>{concerns.length}</strong> concerns</span>
        <span><strong style={{ color: c.green }}>{capSet.length}</strong> capabilities</span>
        <span><strong style={{ color: '#fff' }}>{connections}</strong> connections</span>
      </div>
    </div>
  );
}

function ExpPricing({ submission }) {
  const cam = useCam();
  const tiersAll = submission.tiers || cam.tiers;
  const visible = (submission.tiersToShow && submission.tiersToShow.length) ? tiersAll.filter((t) => submission.tiersToShow.includes(t.id)) : tiersAll;
  const [selected, setSelected] = useState(submission.recommendedTierId || visible[0]?.id || 'full');
  const tier = visible.find((t) => t.id === selected) || visible[0];
  const singleTier = visible.length === 1;
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.lightGray}`, overflow: 'hidden' }}>
      {!singleTier && (
        <div className="bp-tiers" style={{ display: 'grid', gridTemplateColumns: `repeat(${visible.length}, 1fr)`, borderBottom: `1px solid ${c.lightGray}` }}>
          {visible.map((t, i) => { const on = t.id === selected; return (
            <button key={t.id} onClick={() => setSelected(t.id)} style={{ padding: '20px 22px', background: on ? c.purple : '#fff', color: on ? '#fff' : c.purple, border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 200ms ease', borderRight: i < visible.length - 1 ? `1px solid ${c.lightGray}` : 'none' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? c.yellow : c.pink }}>{t.tagline}</div>
              <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 22, marginTop: 6 }}>{t.name}</div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: on ? 0.85 : 0.65, fontWeight: 500 }}>{t.priceRange} · {t.priceUnit}</div>
            </button>
          ); })}
        </div>
      )}
      {singleTier && (
        <div style={{ padding: '22px 28px', background: c.purple, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.yellow }}>{tier.tagline}</div><div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 24, marginTop: 6 }}>{tier.name}</div></div>
          <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 340, lineHeight: 1.55 }}>{tier.pricingModel || 'Custom · based on homes, amenities, and scope.'} Range: <strong style={{ color: '#fff' }}>{tier.rateRange || tier.priceRange}</strong>.</div>
        </div>
      )}
      <div className="bp-pricedetail" style={{ padding: 32, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 36, alignItems: 'start' }} key={selected}>
        <div style={{ animation: 'bp-fadeUp 280ms ease' }}>
          <Eyebrow color={c.pink}>What's included</Eyebrow>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {tier.includes.map((inc) => (<div key={inc} style={{ display: 'flex', gap: 9, fontSize: 13, color: c.purple, fontWeight: 500, lineHeight: 1.45 }}><Icon name="check" size={14} color={c.pink} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} /><span>{inc}</span></div>))}
          </div>
          {tier.setupCopy && (
            <div style={{ marginTop: 22, padding: '14px 16px', background: c.purpleTint, borderRadius: 10, borderLeft: `3px solid ${c.green}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="check" size={14} color={c.green} strokeWidth={3} style={{ flexShrink: 0, marginTop: 3 }} />
              <div style={{ fontSize: 12.5, color: c.purple, lineHeight: 1.55 }}><strong style={{ fontWeight: 700 }}>Onboarding · covered.</strong> {tier.setupCopy} See the 90-day plan below for what we deliver, day by day.</div>
            </div>
          )}
        </div>
        <div style={{ background: c.offWhite, borderRadius: 10, padding: 22, animation: 'bp-fadeUp 280ms ease 80ms both' }}>
          <Eyebrow color={c.pink}>{submission.shortName || submission.association} estimate</Eyebrow>
          {tier.calcLine ? (
            <React.Fragment>
              <div style={{ fontSize: 12, color: c.fgMuted, fontWeight: 600, marginTop: 10, letterSpacing: '0.02em' }}>{tier.calcLine}</div>
              <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 900, fontSize: 36, color: c.purple, marginTop: 8, letterSpacing: '-0.02em', lineHeight: 1.05 }}>${tier.monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              {/* Keyed off minimumProvisional, not minimumApplied: once a real
                  client minimum lands the flag clears and this disappears. */}
              {tier.minimumProvisional && (
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.pink, marginTop: 4 }}>Starting minimum · confirmed on the call</div>
              )}
              <div style={{ fontSize: 12, color: c.fgMuted, fontWeight: 600 }}>per month · {submission.units} homes</div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.lightGray}`, fontSize: 13, color: c.bodyGray, lineHeight: 1.5 }}>Annual: <strong style={{ color: c.purple }}>${tier.annualTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><br /><span style={{ fontSize: 11, color: c.fgMuted }}>{tier.minimumApplied
                ? `This is our minimum monthly fee for a community this size. Final pricing is confirmed on the discovery call once we walk your documents and amenities.`
                : `Per-home rate is custom — finalized on the discovery call once we walk your documents and amenities.`}</span></div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 900, fontSize: 32, color: c.purple, marginTop: 8, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{tier.monthlyEstimate}</div>
              <div style={{ fontSize: 12, color: c.fgMuted, fontWeight: 600 }}>{submission.units} homes</div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.lightGray}`, fontSize: 13, color: c.bodyGray, lineHeight: 1.5 }}>Range: <strong style={{ color: c.purple }}>{tier.rateRange || tier.priceRange}</strong><br /><span style={{ fontSize: 11, color: c.fgMuted }}>Final number set on the discovery call.</span></div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function Timeline() {
  const cam = useCam();
  return (
    <div style={{ position: 'relative', paddingLeft: 26 }}>
      <span style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: c.lightGray }} />
      {cam.onboarding.map((t, i) => (
        <div key={i} style={{ position: 'relative', padding: '8px 0 16px' }}>
          <span style={{ position: 'absolute', left: -23, top: 6, width: 11, height: 11, borderRadius: 999, background: '#fff', border: `2.5px solid ${c.green}` }} />
          <div style={{ fontFamily: 'Gotham, sans-serif', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.green }}>{t.day}</div>
          <div style={{ fontFamily: 'Gotham, sans-serif', fontSize: 15, fontWeight: 800, color: c.purple, marginTop: 2 }}>{t.title}</div>
          <div style={{ fontSize: 13, color: c.bodyGray, lineHeight: 1.55, marginTop: 3, maxWidth: 640 }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function ProposalFooter({ submission }) {
  const cam = useCam();
  return (
    <div style={{ background: c.purpleDeep, color: '#fff' }}>
      <AccentBar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '44px 32px 24px' }}>
        <div className="bp-foot" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
          <div><CAMLogo scheme="dark" size="md" /><div style={{ fontSize: 13, opacity: 0.7, marginTop: 16, lineHeight: 1.65, maxWidth: 360 }}>{cam.footerBlurb}</div></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: c.yellow, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Contact</div><div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.85 }}>{cam.contact.web}<br />{cam.contact.email}<br />{cam.contact.phone}</div></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: c.yellow, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Office</div><div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.85 }}>{cam.office[0]}<br />{cam.office[1]}</div></div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          <span>© 2026 {cam.legalName} · Proposal {submission.proposalId || ''}</span>
          <span style={{ fontWeight: 700, color: c.yellow, letterSpacing: '0.1em', textTransform: 'uppercase' }}><span style={{ marginRight: 6, opacity: 0.6 }}>Built with</span>Alloy</span>
        </div>
      </div>
    </div>
  );
}

function ProposalExp({ lead, submission }) {
  // Only concerns the CAM kept included (Build can toggle one off → it drops
  // from the board doc). Undefined `on` = included (legacy / never-toggled).
  const cam = useCam();
  const concerns = (lead.concerns || []).filter((cc) => cc.on !== false);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = Math.min(activeIndex, Math.max(0, concerns.length - 1));
  const mobile = useIsMobile();
  const rep = repOf(lead.owner, cam);
  const firstName = (submission.contactName || '').split(' ')[0];
  return (
    <article style={{ background: c.offWhite }}>
      <div data-section="Cover & intro" style={{ background: `linear-gradient(135deg, ${c.purple} 0%, ${c.purpleDeep} 60%, #0c1828 100%)`, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <AccentBar />
        <div className="bp-cover" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 36px 44px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <CAMLogo scheme="dark" size="sm" />
              <div style={{ height: 18, width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ fontSize: 11, color: c.yellow, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Custom proposal · live document</div>
            </div>
            <h1 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 40, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.08 }}>{submission.association}</h1>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', maxWidth: 600 }}>Built around the <strong style={{ color: '#fff' }}>{concerns.length} concern{concerns.length === 1 ? '' : 's'}</strong> {firstName} raised on {(submission.submittedAt || '').split(' · ')[0]}. {mobile ? 'Tap any concern to see how we’ll address it.' : 'Click any one on the left to see how we’ll address it.'}</div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}><ScoreCard lead={lead} /></div>
        </div>
      </div>

      {concerns.length > 0 && (
        mobile
          ? <section data-section="Concerns" style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 22px 44px' }}>
              <Eyebrow color={c.pink}>Your concerns</Eyebrow>
              <div style={{ fontSize: 12.5, color: c.fgMuted, margin: '6px 0 16px', lineHeight: 1.55 }}>Tap any concern to see how {cam.shortName} addresses it.</div>
              <ConcernAccordion concerns={concerns} />
            </section>
          : <section data-section="Concerns" className="bp-concerns" style={{ maxWidth: 1180, margin: '0 auto', padding: '44px 36px 64px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32 }}>
              <PainRail concerns={concerns} activeIndex={active} onSelect={setActiveIndex} />
              <AnswerPanel concern={concerns[active]} index={active} total={concerns.length} onNext={() => setActiveIndex((active + 1) % concerns.length)} />
            </section>
      )}

      <section data-section="How this was built" style={{ background: c.purple, color: '#fff', padding: '64px 36px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="bp-built-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 36, gap: 32 }}>
            <div><Eyebrow color={c.yellow}>How this proposal was built</Eyebrow><h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, margin: '12px 0 0', letterSpacing: '-0.015em', lineHeight: 1.1 }}>Your answers wired to our capabilities.</h2></div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', maxWidth: 320, lineHeight: 1.6 }}>We don't send template proposals. Each one is rebuilt around what the board specifically said matters. Here's the matching engine's reasoning.</div>
          </div>
          {mobile ? <EngineList concerns={concerns} /> : <EngineGraph concerns={concerns} />}
        </div>
      </section>

      <section data-section="Pricing tiers" style={{ padding: '64px 36px', background: c.offWhite }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Eyebrow color={c.pink}>Investment</Eyebrow>
          <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, color: c.purple, margin: '12px 0 32px', letterSpacing: '-0.015em', lineHeight: 1.1 }}>Built for a {submission.units}-home, board-led community.</h2>
          <ExpPricing submission={submission} />
        </div>
      </section>

      <section data-section="Your team" style={{ padding: '0 36px 64px', background: c.offWhite }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Eyebrow color={c.pink}>Your team</Eyebrow>
          <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, color: c.purple, margin: '12px 0 24px', letterSpacing: '-0.015em' }}>{cam.team.length} humans who'll know your buildings.</h2>
          <div className="bp-team" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cam.team.length, 4)}, 1fr)`, gap: 12 }}>
            {cam.team.map((t) => (
              <div key={t.name} style={{ background: '#fff', borderRadius: 12, padding: 20, border: `1px solid ${c.lightGray}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: t.color, color: c.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 17 }}>{t.initials}</div>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: c.purple }}>{t.name}</div><div style={{ fontSize: 10.5, color: c.pink, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3, marginBottom: 8 }}>{t.role}</div><div style={{ fontSize: 12, color: c.bodyGray, lineHeight: 1.5 }}>{t.bio}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section data-section="First 90 days" style={{ padding: '64px 36px', background: '#fff', borderTop: `1px solid ${c.lightGray}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Eyebrow color={c.pink}>If you say yes</Eyebrow>
          <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, color: c.purple, margin: '12px 0 32px', letterSpacing: '-0.015em', lineHeight: 1.1 }}>What happens in the first 90 days.</h2>
          <Timeline />
        </div>
      </section>

      <section data-section="Discovery call CTA" style={{ padding: '84px 36px', background: c.purpleDeep, color: '#fff', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow color={c.yellow}>Next step</Eyebrow>
          <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 40, margin: '14px 0 14px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Thirty minutes to decide if we're the right fit.</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 0 }}>Discovery call with {cam.discoveryLead} and {rep.name}{rep.role ? ` (${rep.role})` : ''}. We finalize the engagement, walk through your governing documents, and answer anything this proposal didn't. Use the bar below to respond.</p>
        </div>
      </section>

      <ProposalFooter submission={submission} />
    </article>
  );
}

// ---------- Board response modals (request changes / decline / continue) ----------
const CHANGE_AREAS = ['Pricing / tier structure', 'Transition timeline', 'Specific UVPs / capabilities', 'Manager assignment', 'Reserve study approach', 'Contract terms'];
const DECLINE_REASONS = ['Went with another provider', 'Decided to stay self-managed', 'Out of budget for now', 'Timing is wrong', 'Other — see notes below'];

// Next 4 weekdays as discovery-call slots (always upcoming, never stale).
function upcomingSlots() {
  const times = ['10:00 AM', '2:00 PM', '11:30 AM', '9:00 AM'];
  const dows = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const out = []; const d = new Date();
  while (out.length < 4) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const time = times[out.length];
    out.push({ dow: dows[dow], day: d.getDate(), time, label: `${dows[dow]} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()} · ${time}` });
  }
  return out;
}

const mPrimary = { fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '12px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', background: c.purple, color: '#fff' };
const mGhost = { fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'transparent', color: c.fgMuted };
const mArea = { width: '100%', minHeight: 76, padding: '12px 14px', borderRadius: 12, border: `1px solid ${c.lightGray}`, fontFamily: 'Poppins,sans-serif', fontSize: 13.5, color: c.purple, resize: 'vertical', outline: 'none', boxSizing: 'border-box' };
const mFoot = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 };
const mInput = { width: '100%', padding: '11px 13px', borderRadius: 10, border: `1px solid ${c.lightGray}`, fontFamily: 'Poppins,sans-serif', fontSize: 13.5, color: c.purple, outline: 'none', boxSizing: 'border-box' };

// Attribution on a board response: capture who's responding (the link is shared,
// so "who" matters) and, for a binding verdict, confirm they speak for the board.
// One field + one checkbox — identity-lite, no login. `by` flows to the verdict.
function IdentityFields({ name, setName, authorized, setAuthorized, requireAuth }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={mInput} />
      {requireAuth && (
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 11, cursor: 'pointer', fontSize: 12.5, lineHeight: 1.4, color: c.bodyGray }}>
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>I'm authorized to respond on behalf of the board.</span>
        </label>
      )}
    </div>
  );
}

function BoardModal({ children, onClose, maxWidth = 540 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,12,38,0.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20, fontFamily: 'Gotham,Poppins,sans-serif' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth, background: '#fff', borderRadius: 18, boxShadow: '0 30px 90px rgba(26,12,38,0.45)', padding: '32px 34px 26px', position: 'relative', animation: 'bp-fadeUp 220ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: c.fgMuted, padding: 4 }}><Icon name="x" size={18} /></button>
        {children}
      </div>
    </div>
  );
}
function MHead({ eyebrow, color, title, sub }) {
  return (
    <div style={{ marginBottom: 18, paddingRight: 24 }}>
      <Eyebrow color={color}>{eyebrow}</Eyebrow>
      <h3 style={{ fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 800, fontSize: 23, lineHeight: 1.18, color: c.purple, margin: '10px 0 0', letterSpacing: '-0.01em' }}>{title}</h3>
      {sub && <p style={{ fontSize: 13.5, lineHeight: 1.55, color: c.bodyGray, margin: '10px 0 0' }}>{sub}</p>}
    </div>
  );
}
function OptionPill({ checked, onClick, kind = 'check', children }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 11, border: `1.5px solid ${checked ? c.purple : c.lightGray}`, background: checked ? 'rgba(43,44,108,0.05)' : '#fff', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, color: c.purple, transition: 'all 140ms' }}>
      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: kind === 'radio' ? 999 : 5, border: `1.5px solid ${checked ? c.purple : '#c9c5d4'}`, background: checked ? c.purple : '#fff', display: 'grid', placeItems: 'center' }}>
        {checked && (kind === 'radio' ? <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} /> : <Icon name="check" size={12} color="#fff" strokeWidth={3} />)}
      </span>
      {children}
    </button>
  );
}

function RequestChangesModal({ onClose, onResolve }) {
  const [areas, setAreas] = useState([]);
  const [specifics, setSpecifics] = useState('');
  const [name, setName] = useState('');
  const toggle = (a) => setAreas((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const ready = (areas.length || specifics.trim()) && name.trim();
  const submit = () => { if (!ready) return; onResolve('changes', `Requested changes${areas.length ? ': ' + areas.join(', ') : ''}`, { areas, specifics: specifics.trim() }, name.trim()); onClose(); };
  return (
    <BoardModal onClose={onClose}>
      <MHead eyebrow="Request changes" color={c.purple} title="Where would you like edits?" sub="Pick any. We'll send a revised proposal within 2 business days — same link." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {CHANGE_AREAS.map((a) => <OptionPill key={a} checked={areas.includes(a)} onClick={() => toggle(a)}>{a}</OptionPill>)}
      </div>
      <textarea style={{ ...mArea, marginBottom: 14 }} placeholder="Specifics — what should change?" value={specifics} onChange={(e) => setSpecifics(e.target.value)} />
      <IdentityFields name={name} setName={setName} />
      <div style={mFoot}><button style={mGhost} onClick={onClose}>Cancel</button><button style={{ ...mPrimary, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={submit}>Send request</button></div>
    </BoardModal>
  );
}
function DeclineModal({ onClose, onResolve }) {
  const cam = useCam();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const ready = name.trim() && authorized;
  const submit = () => { if (!ready) return; onResolve('decline', `Declined${reason ? ': ' + reason : ''}`, { reason, notes: notes.trim() }, name.trim()); onClose(); };
  return (
    <BoardModal onClose={onClose}>
      <MHead eyebrow="Declining the proposal" color={c.purple} title="No problem — what's the main reason?" sub="Optional, but it helps us learn. Nothing about your answer triggers a follow-up call." />
      <div style={{ display: 'grid', gap: 9, marginBottom: 14 }}>
        {DECLINE_REASONS.map((r) => <OptionPill key={r} kind="radio" checked={reason === r} onClick={() => setReason(r)}>{r}</OptionPill>)}
      </div>
      <textarea style={{ ...mArea, marginBottom: 14 }} placeholder={`Anything else you'd like ${cam.shortName} to know (optional)…`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <IdentityFields name={name} setName={setName} authorized={authorized} setAuthorized={setAuthorized} requireAuth />
      <div style={mFoot}><button style={mGhost} onClick={onClose}>Cancel</button><button style={{ ...mPrimary, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={submit}>Send response</button></div>
    </BoardModal>
  );
}
function ContinueModal({ onClose, onResolve, rep }) {
  const cam = useCam();
  const slots = useMemo(() => upcomingSlots(), []);
  const [sel, setSel] = useState(null);
  const [done, setDone] = useState(null); // null | 'call' | 'email'
  const [name, setName] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const identok = name.trim() && authorized;
  const confirmCall = () => { if (sel == null || !identok) return; onResolve('continue', `Booked a discovery call · ${slots[sel].label}`, { method: 'call', slot: slots[sel].label }, name.trim()); setDone('call'); };
  const chooseEmail = () => { if (!identok) return; onResolve('continue', 'Asked to connect by email', { method: 'email' }, name.trim()); setDone('email'); };

  if (done) return (
    <BoardModal onClose={onClose}>
      <div style={{ width: 46, height: 46, borderRadius: 999, background: done === 'call' ? c.purple : c.cmgtGreen, display: 'grid', placeItems: 'center', marginBottom: 16 }}><Icon name={done === 'call' ? 'check' : 'message-square'} size={22} color="#fff" /></div>
      <MHead eyebrow="Confirmed" color={c.cmgtGreen} title={done === 'call' ? `You're on the ${cam.shortName} team's calendar.` : "We'll be in touch by email."} sub={done === 'call'
        ? `A calendar invite is on its way to the email on file. ${cam.discoveryLeadFirst} and ${rep.first} will call you at the number we have. Reply to the invite if you need to reschedule.`
        : `${rep.first} will email you shortly to find a time that works — no call required until you're ready.`} />
      {done === 'call' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: c.offWhite, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 800, color: c.purple }}>{slots[sel].label}</div>
        <div style={{ fontSize: 12, color: c.fgMuted, fontWeight: 600 }}>30 minutes</div>
      </div>}
      <div style={{ ...mFoot, justifyContent: 'flex-end' }}><button style={mPrimary} onClick={onClose}>Done</button></div>
    </BoardModal>
  );
  return (
    <BoardModal onClose={onClose}>
      <div style={{ width: 46, height: 46, borderRadius: 999, background: c.cmgtGreen, display: 'grid', placeItems: 'center', marginBottom: 16 }}><Icon name="check" size={22} color="#fff" /></div>
      <MHead eyebrow="You're moving forward" color={c.cmgtGreen} title="One last step — pick a time for the discovery call." sub={`30 minutes with ${cam.discoveryLead} and ${rep.name}${rep.role ? ` (${rep.role})` : ''}. We finalize the engagement and walk through the transition checklist — your dedicated CAM is assigned during onboarding.`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 9, marginBottom: 10 }}>
        {slots.map((s, i) => (
          <button key={i} onClick={() => setSel(i)} style={{ padding: '12px 6px', borderRadius: 11, border: `1.5px solid ${sel === i ? c.purple : c.lightGray}`, background: sel === i ? 'rgba(43,44,108,0.05)' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: c.fgMuted }}>{s.dow}</div>
            <div style={{ fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 800, fontSize: 19, color: c.purple, margin: '2px 0' }}>{s.day}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.bodyGray }}>{s.time}</div>
          </button>
        ))}
      </div>
      <button onClick={chooseEmail} disabled={!identok} style={{ background: 'none', border: 'none', cursor: identok ? 'pointer' : 'default', color: c.purple, fontSize: 12.5, fontWeight: 700, padding: '4px 0', textDecoration: 'underline', opacity: identok ? 1 : 0.45 }}>Prefer to connect by email instead?</button>
      <div style={{ marginTop: 14 }}><IdentityFields name={name} setName={setName} authorized={authorized} setAuthorized={setAuthorized} requireAuth /></div>
      <div style={mFoot}><button style={mGhost} onClick={onClose}>Not now</button><button style={{ ...mPrimary, opacity: (sel == null || !identok) ? 0.5 : 1 }} disabled={sel == null || !identok} onClick={confirmCall}>Confirm time</button></div>
    </BoardModal>
  );
}

// A board member's question/note — voice that's always available, even after a
// verdict. Non-binding: records an event that surfaces in the CAM's Close feed.
function QuestionModal({ onClose, onAsk, rep }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const ready = text.trim() && name.trim();
  const submit = () => { if (!ready) return; onAsk(text.trim(), name.trim()); setSent(true); };
  if (sent) return (
    <BoardModal onClose={onClose}>
      <div style={{ width: 46, height: 46, borderRadius: 999, background: c.cmgtGreen, display: 'grid', placeItems: 'center', marginBottom: 16 }}><Icon name="check" size={22} color="#fff" /></div>
      <MHead eyebrow="Sent" color={c.cmgtGreen} title="Your question is with the team." sub={`${rep.first} will follow up. You can keep reviewing the proposal — asking a question doesn't change your board's decision.`} />
      <div style={{ ...mFoot, justifyContent: 'flex-end' }}><button style={mPrimary} onClick={onClose}>Done</button></div>
    </BoardModal>
  );
  return (
    <BoardModal onClose={onClose}>
      <MHead eyebrow="Ask a question" color={c.purple} title="Something you'd like clarified?" sub={`Send it straight to ${rep.name}${rep.role ? ` (${rep.role})` : ''}. This is just a question — it won't accept, decline, or change the proposal.`} />
      <textarea style={{ ...mArea, marginBottom: 14 }} placeholder="What would you like to know?" value={text} onChange={(e) => setText(e.target.value)} />
      <IdentityFields name={name} setName={setName} />
      <div style={mFoot}><button style={mGhost} onClick={onClose}>Cancel</button><button style={{ ...mPrimary, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={submit}>Send question</button></div>
    </BoardModal>
  );
}

function BoardActionBar({ submission, boardResp, onOpen }) {
  const cam = useCam();
  const firstName = (submission.contactName || '').split(' ')[0] || 'there';
  const mobile = useIsMobile();
  // Once the board has a verdict, EVERY viewer sees a resolved banner (with who
  // recorded it) instead of live buttons — a later member can't silently flip an
  // accept into a change-request. They keep their voice via "Ask the team".
  const verdict = boardResp?.action || null;
  const banner = {
    changes: { ic: 'message-square', color: c.purple, text: <span><strong>Change request sent.</strong> A revised proposal is on the way.</span> },
    decline: { ic: 'x', color: c.fgMuted, text: <span><strong>Response recorded.</strong> Thanks for considering {cam.shortName}.</span> },
    continue: { ic: 'check', color: c.cmgtGreen, text: <span><strong>Your board is moving forward.</strong> The {cam.shortName} team will be in touch to set up your discovery call.</span> },
  }[verdict];
  const attribution = boardResp ? [boardResp.by ? `Recorded by ${boardResp.by}` : 'Recorded', fmtWhen(boardResp.at)].filter(Boolean).join(' · ') : '';
  const AskLink = ({ block }) => (
    <button onClick={() => onOpen('question')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.purple, fontSize: 12, fontWeight: 700, padding: block ? '2px 0' : 0, textDecoration: 'underline', fontFamily: 'Gotham,Poppins,sans-serif' }}>Have a question? Ask the team</button>
  );
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${c.lightGray}`, boxShadow: '0 -8px 24px rgba(56,28,79,0.10)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="bp-bar" style={{ maxWidth: 1100, margin: '0 auto', padding: mobile ? '12px 16px' : '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexDirection: mobile ? 'column' : 'row' }}>
        {banner ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: c.purple, fontWeight: 500, textAlign: 'left' }}>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: banner.color, color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={banner.ic} size={15} /></span>{banner.text}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', fontSize: 11.5, color: c.fgMuted }}>
              {attribution && <span>{attribution}</span>}
              {attribution && <span aria-hidden="true">·</span>}
              <AskLink />
            </div>
          </div>
        ) : mobile ? (
          <React.Fragment>
            <div style={{ fontSize: 12.5, color: c.purple, fontWeight: 500, textAlign: 'center' }}><strong>{firstName},</strong>{submission.validThrough ? <> you have until <strong>{submission.validThrough}</strong> to respond.</> : <> take the time you need — we'll follow up.</>}</div>
            <button onClick={() => onOpen('continue')} style={{ width: '100%', appearance: 'none', border: 'none', cursor: 'pointer', background: c.cmgtGreen, color: '#fff', fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em', padding: '15px', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="arrow-right" size={15} /> Accept &amp; Continue</button>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button onClick={() => onOpen('changes')} style={{ flex: 1, appearance: 'none', cursor: 'pointer', background: '#fff', border: `1px solid ${c.lightGray}`, color: c.purple, fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 700, fontSize: 12.5, padding: '12px', borderRadius: 11 }}>Request changes</button>
              <button onClick={() => onOpen('decline')} style={{ flex: 1, appearance: 'none', cursor: 'pointer', background: '#fff', border: `1px solid ${c.lightGray}`, color: c.pink, fontFamily: 'Gotham,Poppins,sans-serif', fontWeight: 700, fontSize: 12.5, padding: '12px', borderRadius: 11 }}>Decline</button>
            </div>
            <AskLink block />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, color: c.purple, fontWeight: 500 }}><strong>{firstName},</strong>{submission.validThrough ? <> you have until <strong>{submission.validThrough}</strong> to respond.</> : <> take the time you need — we'll follow up.</>}</div>
              <AskLink />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={() => onOpen('changes')}><Icon name="message-square" size={14} /> Request changes</Button>
              <Button variant="danger" size="md" onClick={() => onOpen('decline')}><Icon name="x" size={14} /> Decline</Button>
              <Button variant="primary" size="md" onClick={() => onOpen('continue')}><Icon name="arrow-right" size={14} /> Continue</Button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// Short "when" for the resolved-verdict banner. Today → time; older → date.
function fmtWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// Per-device anonymous viewer id (stable across reloads on the same browser).
function viewerKey() {
  try {
    let k = localStorage.getItem('cmgt-board-viewer');
    if (!k) { k = 'v-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('cmgt-board-viewer', k); }
    return k;
  } catch { return 'anon'; }
}

// Remember the board member's choice so reopening the link doesn't reset it.
// Per-device (localStorage, keyed by board_token) — the realistic reopen is the
// same person on the same phone. The server also has the record (proposal-respond),
// but this makes the confirmation survive a reload with no round-trip.
const RESP_KEY = (token) => 'cmgt-board-response-' + token;
function readBoardResponse(token) {
  if (!token) return null;
  try { return localStorage.getItem(RESP_KEY(token)) || null; } catch { return null; }
}
function writeBoardResponse(token, action) {
  if (!token) return;
  try { localStorage.setItem(RESP_KEY(token), action); } catch { /* ignore */ }
}

// Emit board engagement to the proposal-track edge fn (the anonymous-write seam),
// gated by the proposal's board_token. Skips the in-cockpit Build preview (which
// renders this same doc inside an iframe) so staff previews don't count as board
// engagement. No-op in mock dev (no Supabase, no token).
function useBoardTelemetry(lead, enabled) {
  const token = lead?.boardToken;
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !supabase || !token) return;
    if (typeof window !== 'undefined' && window.top !== window.self) return; // preview iframe → skip
    const vk = viewerKey();
    const emit = (eventType, extra = {}) =>
      supabase.functions.invoke('proposal-track', { body: { token, eventType, viewerKey: vk, ...extra } }).catch(() => {});
    emit('open');
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    const seen = {};
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const name = e.target.getAttribute('data-section') || '';
        const pct = Math.round((e.intersectionRatio || 0) * 100);
        if (pct > (seen[name] || 0) + 10) { seen[name] = pct; emit('section', { section: name, pct }); }
      });
    }, { threshold: [0.2, 0.5, 0.8, 1] });
    document.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    const onHidden = () => { if (document.visibilityState === 'hidden') emit('heartbeat', { ms: Math.round(now() - t0) }); };
    document.addEventListener('visibilitychange', onHidden);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onHidden); };
  }, [token, enabled]);
}

export function BoardProposal({ lead, showActionBar }) {
  const cam = useMemo(() => camFor(lead?.accountId), [lead?.accountId]);
  const submission = useMemo(() => buildSubmission(lead, cam), [lead, cam]);
  const [modal, setModal] = useState(null);        // 'changes' | 'decline' | 'continue' | 'question' | null
  // The board's verdict {action, by, at}, seeded from the server (shared across
  // all viewers of this link) or the per-device remembered action. Once set, the
  // action bar shows a resolved banner instead of live buttons — so reopening the
  // link keeps the decision, and a later member can't silently flip it.
  const [boardResp, setBoardResp] = useState(() => {
    if (!showActionBar) return null;
    if (lead?.boardResponse) return lead.boardResponse;
    const a = readBoardResponse(lead?.boardToken);
    return a ? { action: a } : null;
  });
  // The board view (with the action bar) is the real surface → track engagement.
  useBoardTelemetry(lead, !!showActionBar);

  const inCockpitPreview = typeof window !== 'undefined' && window.top !== window.self;

  // Record the board's VERDICT (continue/decline/changes) to the token-gated
  // proposal-respond fn. Optimistic locally, then reconciled to the server's
  // authoritative (forward-only) verdict — so a racing responder immediately
  // sees the winning decision, not their own losing click.
  const onResolve = (action, label, meta, by) => {
    writeBoardResponse(lead?.boardToken, action); // remember on this device
    setBoardResp({ action, by: by || undefined, at: new Date().toISOString() });
    if (isSupabaseConfigured && supabase && lead?.boardToken && !inCockpitPreview) {
      supabase.functions.invoke('proposal-respond', { body: { token: lead.boardToken, action, label, meta, viewerName: by, viewerKey: viewerKey() } })
        .then(({ data }) => { if (data && data.boardResponse) setBoardResp(data.boardResponse); })
        .catch(() => {});
    }
  };
  // A question is VOICE, not a verdict: records an event only, never touches the
  // verdict. Always available, even after the board has decided.
  const onAskQuestion = (text, by) => {
    if (isSupabaseConfigured && supabase && lead?.boardToken && !inCockpitPreview) {
      supabase.functions.invoke('proposal-respond', { body: { token: lead.boardToken, action: 'question', label: text, meta: { text }, viewerName: by, viewerKey: viewerKey() } }).catch(() => {});
    }
  };
  const close = () => setModal(null);
  const barMobile = useIsMobile();
  return (
    <CamCtx.Provider value={cam}>
      <div className="bp-root" style={{ background: c.offWhite, paddingBottom: showActionBar ? (barMobile ? 168 : 76) : 0 }}>
        <GlobalStyles />
        <ProposalExp lead={lead} submission={submission} />
        {showActionBar && <BoardActionBar submission={submission} boardResp={boardResp} onOpen={setModal} />}
        {modal === 'changes' && <RequestChangesModal onClose={close} onResolve={onResolve} />}
        {modal === 'decline' && <DeclineModal onClose={close} onResolve={onResolve} />}
        {modal === 'continue' && <ContinueModal onClose={close} onResolve={onResolve} rep={repOf(lead.owner, cam)} />}
        {modal === 'question' && <QuestionModal onClose={close} onAsk={onAskQuestion} rep={repOf(lead.owner, cam)} />}
      </div>
    </CamCtx.Provider>
  );
}

export function BoardProposalPage({ id }) {
  // `id` is the board's magic-link credential. Mock dev / cockpit-with-DATA:
  // the proposal is already in getLeads() (keyed by lead_key) → render it.
  // Real magic link (logged-out board member): `id` is the unguessable
  // board_token → resolve it ANONYMOUSLY via the proposal-board edge fn (no
  // portal session, RLS can't serve them). The fn returns board-safe fields;
  // we enrich locally (matcher + UVP prose are bundled) and render.
  const [lead, setLead] = useState(() => getLeads().find((l) => l.id === id || l.id.toLowerCase() === String(id).toLowerCase()) || null);
  const [status, setStatus] = useState('idle'); // idle | loading | notfound
  useEffect(() => {
    if (lead) return;                                       // already resolved (mock / cockpit)
    if (!isSupabaseConfigured || !supabase) { setStatus('notfound'); return; }
    let cancelled = false;
    setStatus('loading');
    (async () => {
      const { data, error } = await supabase.functions.invoke('proposal-board', { body: { token: id } });
      if (cancelled) return;
      if (!error && data && data.proposal) { setLead(enrichLead(data.proposal, camFor(data.proposal.accountId))); setStatus('idle'); }
      else setStatus('notfound');
    })();
    return () => { cancelled = true; };
  }, [id]);
  if (!lead) return <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', color: COLORS.fgMuted, fontFamily: 'Poppins, sans-serif' }}>{status === 'loading' ? 'Loading proposal…' : status === 'notfound' ? 'This proposal link is invalid or has expired.' : ''}</div>;
  return <BoardProposal lead={lead} showActionBar />;
}
