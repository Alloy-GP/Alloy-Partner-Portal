import React from 'react';
import { getLeads, enrichLead } from '../lib/proposalMockData.js';
import { COLORS, UVPS, TIERS, TEAM, ONBOARDING_TIMELINE, buildSubmission, CAM_COMPANY } from '../lib/boardData.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { proposalRowToRaw } from '../lib/loadData.js';

// ============================================================================
// Board-facing proposal document (Direction 3 · Interactive) — the real
// CMGT-branded page the HOA board reads (ported from board/proposal-exp.jsx).
//
// Renders from the SAME enriched lead data the Review screen uses — the lead's
// `concerns` (label/headline/body/proof/metric/caps), `links`, `match`,
// `capsMatched`/`capsTotal`, `gapNote` (the LLM/engine output). So Review →
// Build → board doc → Close all show one consistent example. UVP `caps` are
// indices into UVPS (the 14-UVP library, identical order in board + cockpit
// data), which supplies the per-cap title/body/icon shown on each concern.
//
// Self-contained inline styles via COLORS (NOT the .proposal-system scoped CSS).
// Driven by any lead; shown in the Build preview iframe and at /proposals/board/:id.
// ============================================================================

const { useState, useRef, useEffect, useMemo } = React;
const c = COLORS;

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
  const h = { sm: 22, md: 30, lg: 44 }[size];
  const src = scheme === 'dark' ? '/proposal-assets/cmgt-logo-white.svg' : '/proposal-assets/cmgt-logo.svg';
  return <img src={src} alt="CMGT" style={{ height: h, display: 'block' }} />;
}

function GlobalStyles() {
  return <style>{`
    @keyframes bp-fadeUp { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
    .bp-root { font-family: "Gotham","Poppins",system-ui,sans-serif; color: ${c.purple}; -webkit-font-smoothing: antialiased; }
    .bp-root *, .bp-root *::before, .bp-root *::after { box-sizing: border-box; }
    .bp-root ::selection { background: ${c.pink}; color: #fff; }
  `}</style>;
}

// ---------- document pieces (driven by the lead's LLM concerns) ----------
function ScoreCard({ lead }) {
  const pct = lead.match;
  const remainder = 100 - pct;
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '20px 22px', backdropFilter: 'blur(10px)', minWidth: 280, maxWidth: 360 }}>
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
  return (
    <div style={{ position: 'sticky', top: 18, alignSelf: 'start' }}>
      <Eyebrow color={c.pink}>Your concerns</Eyebrow>
      <div style={{ fontSize: 12, color: c.fgMuted, marginTop: 6, marginBottom: 14, lineHeight: 1.55 }}>Click any to see how CMGT addresses it.</div>
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
  if (!concern) return null;
  const caps = concern.caps.map((i) => UVPS[i]).filter(Boolean);
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
          <div style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 900, fontSize: 48, color: c.yellow, lineHeight: 1, letterSpacing: '-0.02em' }}>{concern.metric.value}</div>
          <div>
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
  const wrapRef = useRef(null);
  const [W, setW] = useState(900);
  const [active, setActive] = useState(null);
  useEffect(() => { const measure = () => { if (wrapRef.current) setW(wrapRef.current.offsetWidth); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  const capList = useMemo(() => { const set = []; concerns.forEach((c2) => c2.caps.forEach((i) => { if (!set.includes(i)) set.push(i); })); return set; }, [concerns]);
  const pains = concerns.map((c2) => c2.label);
  const uvps = capList.map((i) => ({ i, title: (UVPS[i]?.title || '').split('—')[0].trim() }));
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
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.green, textAlign: 'right', width: '40%' }}>CMGT capabilities</span>
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

function ExpPricing({ submission }) {
  const tiersAll = submission.tiers || TIERS;
  const visible = (submission.tiersToShow && submission.tiersToShow.length) ? tiersAll.filter((t) => submission.tiersToShow.includes(t.id)) : tiersAll;
  const [selected, setSelected] = useState(submission.recommendedTierId || visible[0]?.id || 'full');
  const tier = visible.find((t) => t.id === selected) || visible[0];
  const singleTier = visible.length === 1;
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.lightGray}`, overflow: 'hidden' }}>
      {!singleTier && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visible.length}, 1fr)`, borderBottom: `1px solid ${c.lightGray}` }}>
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
      <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 36, alignItems: 'start' }} key={selected}>
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
              <div style={{ fontSize: 12, color: c.fgMuted, fontWeight: 600 }}>per month · {submission.units} homes</div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.lightGray}`, fontSize: 13, color: c.bodyGray, lineHeight: 1.5 }}>Annual: <strong style={{ color: c.purple }}>${tier.annualTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><br /><span style={{ fontSize: 11, color: c.fgMuted }}>Per-home rate is custom — finalized on the discovery call once we walk your documents and amenities.</span></div>
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
  return (
    <div style={{ position: 'relative', paddingLeft: 26 }}>
      <span style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: c.lightGray }} />
      {ONBOARDING_TIMELINE.map((t, i) => (
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
  return (
    <div style={{ background: c.purpleDeep, color: '#fff' }}>
      <AccentBar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '44px 32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
          <div><CAMLogo scheme="dark" size="md" /><div style={{ fontSize: 13, opacity: 0.7, marginTop: 16, lineHeight: 1.65, maxWidth: 360 }}>Community association management for the Gulf South. Family-run since 2007. CAI member · CMCA-credentialed team.</div></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: c.yellow, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Contact</div><div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.85 }}>cmgt.org<br />proposals@cmgt.org<br />(225) 791-1505</div></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: c.yellow, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Office</div><div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.85 }}>140 Aspen Square, Suite H<br />Denham Springs, LA 70726</div></div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          <span>© 2026 Community Management, LLC · Proposal {submission.proposalId || ''}</span>
          <span style={{ fontWeight: 700, color: c.yellow, letterSpacing: '0.1em', textTransform: 'uppercase' }}><span style={{ marginRight: 6, opacity: 0.6 }}>Built with</span>Alloy</span>
        </div>
      </div>
    </div>
  );
}

function ProposalExp({ lead, submission }) {
  const concerns = lead.concerns;
  const [activeIndex, setActiveIndex] = useState(0);
  const firstName = (submission.contactName || '').split(' ')[0];
  return (
    <article style={{ background: c.offWhite }}>
      <div data-section="Cover & intro" style={{ background: `linear-gradient(135deg, ${c.purple} 0%, ${c.purpleDeep} 60%, #0c1828 100%)`, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <AccentBar />
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 36px 44px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <CAMLogo scheme="dark" size="sm" />
              <div style={{ height: 18, width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ fontSize: 11, color: c.yellow, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Custom proposal · live document</div>
            </div>
            <h1 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 40, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.08 }}>{submission.association}</h1>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', maxWidth: 600 }}>Built around the <strong style={{ color: '#fff' }}>{concerns.length} concern{concerns.length === 1 ? '' : 's'}</strong> {firstName} raised on {(submission.submittedAt || '').split(' · ')[0]}. Click any one on the left to see how we'll address it.</div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}><ScoreCard lead={lead} /></div>
        </div>
      </div>

      <section data-section="Concerns" style={{ maxWidth: 1180, margin: '0 auto', padding: '44px 36px 64px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32 }}>
        <PainRail concerns={concerns} activeIndex={activeIndex} onSelect={setActiveIndex} />
        <AnswerPanel concern={concerns[activeIndex]} index={activeIndex} total={concerns.length} onNext={() => setActiveIndex((activeIndex + 1) % concerns.length)} />
      </section>

      <section data-section="How this was built" style={{ background: c.purple, color: '#fff', padding: '64px 36px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 36, gap: 32 }}>
            <div><Eyebrow color={c.yellow}>How this proposal was built</Eyebrow><h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, margin: '12px 0 0', letterSpacing: '-0.015em', lineHeight: 1.1 }}>Your answers wired to our capabilities.</h2></div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', maxWidth: 320, lineHeight: 1.6 }}>We don't send template proposals. Each one is rebuilt around what the board specifically said matters. Here's the matching engine's reasoning.</div>
          </div>
          <EngineGraph concerns={concerns} />
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
          <h2 style={{ fontFamily: 'Gotham, sans-serif', fontWeight: 800, fontSize: 36, color: c.purple, margin: '12px 0 24px', letterSpacing: '-0.015em' }}>{TEAM.length} humans who'll know your buildings.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(TEAM.length, 4)}, 1fr)`, gap: 12 }}>
            {TEAM.map((t) => (
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
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 0 }}>Discovery call with Jeff Harman (CEO & founder) and Amanda Betancourt (COO). We finalize the engagement, walk through your governing documents, and answer anything this proposal didn't. Use the bar below to respond.</p>
        </div>
      </section>

      <ProposalFooter submission={submission} />
    </article>
  );
}

function BoardActionBar({ submission, responded, onAccept, onDecline, onRequest }) {
  const firstName = (submission.contactName || '').split(' ')[0] || 'there';
  const confirm = {
    accept: { ic: 'check', color: c.green, text: <span><strong>Accepted — thank you, {firstName}.</strong> Amanda will be in touch to schedule your onboarding call.</span> },
    decline: { ic: 'x', color: c.fgMuted, text: <span><strong>Response recorded.</strong> Thanks for considering CMGT, {firstName}.</span> },
    request: { ic: 'message-square', color: c.purple, text: <span><strong>Change request sent.</strong> Amanda will follow up with you shortly.</span> },
  }[responded];
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${c.lightGray}`, boxShadow: '0 -8px 24px rgba(56,28,79,0.10)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        {confirm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: c.purple, fontWeight: 500, margin: '0 auto' }}>
            <span style={{ width: 30, height: 30, borderRadius: 999, background: confirm.color, color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={confirm.ic} size={15} /></span>{confirm.text}
          </div>
        ) : (
          <React.Fragment>
            <div style={{ fontSize: 13, color: c.purple, fontWeight: 500 }}><strong>{firstName},</strong> you have until <strong>{submission.validThrough}</strong> to respond.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={onRequest}><Icon name="message-square" size={14} /> Request Changes</Button>
              <Button variant="danger" size="md" onClick={onDecline}><Icon name="x" size={14} /> Decline</Button>
              <Button variant="primary" size="md" onClick={onAccept}><Icon name="check" size={14} /> Accept &amp; Continue</Button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// Per-device anonymous viewer id (stable across reloads on the same browser).
function viewerKey() {
  try {
    let k = localStorage.getItem('cmgt-board-viewer');
    if (!k) { k = 'v-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('cmgt-board-viewer', k); }
    return k;
  } catch { return 'anon'; }
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
  const submission = useMemo(() => buildSubmission(lead), [lead]);
  const [responded, setResponded] = useState(null);
  // The board view (with the action bar) is the real surface → track it.
  useBoardTelemetry(lead, !!showActionBar);
  const trackCta = (label) => {
    if (!showActionBar || !isSupabaseConfigured || !supabase || !lead?.boardToken) return;
    if (typeof window !== 'undefined' && window.top !== window.self) return;
    supabase.functions.invoke('proposal-track', { body: { token: lead.boardToken, eventType: 'cta', viewerKey: viewerKey(), section: label } }).catch(() => {});
  };
  return (
    <div className="bp-root" style={{ background: c.offWhite, paddingBottom: showActionBar ? 76 : 0 }}>
      <GlobalStyles />
      <ProposalExp lead={lead} submission={submission} />
      {showActionBar && <BoardActionBar submission={submission} responded={responded} onAccept={() => { setResponded('accept'); trackCta('Accept'); }} onDecline={() => { setResponded('decline'); trackCta('Decline'); }} onRequest={() => { setResponded('request'); trackCta('Request changes'); }} />}
    </div>
  );
}

export function BoardProposalPage({ id }) {
  // Cockpit context: the proposal is already in DATA.proposals (with its token).
  // Standalone (e.g. "Open full proposal" in a new tab): DATA isn't loaded, so
  // fetch this one proposal directly (authed) — which gives it the board_token
  // the telemetry emit needs. (The no-session anonymous path will swap this for a
  // token-based read fn.)
  const [lead, setLead] = useState(() => getLeads().find((l) => l.id === id || l.id.toLowerCase() === String(id).toLowerCase()) || null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (lead && lead.boardToken) return;            // already have full data
    if (!isSupabaseConfigured || !supabase) return; // mock dev → keep the mock lead
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from('proposals').select('*').eq('lead_key', id).limit(1).maybeSingle();
      if (cancelled) return;
      if (data) setLead(enrichLead(proposalRowToRaw(data)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);
  if (!lead) return <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', color: COLORS.fgMuted, fontFamily: 'Poppins, sans-serif' }}>{loading ? 'Loading proposal…' : 'Proposal not found.'}</div>;
  return <BoardProposal lead={lead} showActionBar />;
}
