import React from 'react';

// Shared proposal visuals used by both the cockpit (screen-proposals.jsx) and
// the board document (proposal-doc.jsx). Kept here to avoid a circular import.

const { useState, useRef, useEffect } = React;

// Animated conic-donut match ring (components.jsx MatchRing, Direction B).
export function MatchRing({ value, size = 64, label, caps, capsTotal, dark }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf, start = null; const dur = 950;
    const step = (ts) => { if (start == null) start = ts; const p = Math.min(1, (ts - start) / dur); setShown(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    const t = setTimeout(() => { raf = requestAnimationFrame(step); }, 120);
    return () => { clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  const thick = Math.max(6, Math.round(size * (size >= 100 ? 0.092 : 0.12)));
  const hi = value >= 90, mid = value >= 75;
  const g1 = hi ? '#46cf86' : mid ? '#e6bd57' : '#dd8585';
  const g2 = hi ? '#1f8f55' : mid ? '#b8881a' : '#b04a4a';
  const deg = (shown / 100) * 360;
  const numFont = caps != null ? Math.round(size * 0.2) : (size >= 80 ? Math.round(size * 0.27) : 16);
  return (
    <div className="ps-ring" style={{ width: size, height: size }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 0deg, ${g1} 0deg, ${g2} ${deg}deg, var(--alloy-light-gray) ${deg}deg 360deg)` }} />
      <div style={{ position: 'absolute', inset: thick, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 1px 3px rgba(56,28,79,0.08)' }} />
      <div className="ps-ring-num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: label ? 1 : 0, fontSize: numFont, color: dark ? '#2a3650' : undefined }}>
        <span className="rn" style={{ fontWeight: 800 }}>{Math.round(shown)}<small>%</small></span>
        {label && <span className="ps-ring-fitlab" style={{ fontSize: Math.max(11, Math.round(size * 0.095)) }}>{label}</span>}
        {caps != null && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: '#7c8698', lineHeight: 1, whiteSpace: 'nowrap', fontSize: Math.max(9.5, Math.round(size * 0.066)), marginTop: Math.round(size * 0.03) }}>
            <b style={{ color: dark ? '#2a3650' : 'var(--alloy-purple)', fontWeight: 800 }}>{caps}/{capsTotal}</b> capabilities
          </span>
        )}
      </div>
    </div>
  );
}

// Bipartite concern ↔ UVP graph (components.jsx MatchingEngine).
export function MatchingEngine({ concerns, uvps, links }) {
  const wrapRef = useRef(null);
  const [W, setW] = useState(680);
  const [active, setActive] = useState(null);
  useEffect(() => {
    const measure = () => { if (wrapRef.current) setW(wrapRef.current.offsetWidth); };
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const n = concerns.length, m = uvps.length;
  const rowH = 46, H = Math.max(n, m) * rowH + 24, padTop = 12, usableH = H - padTop * 2;
  const yL = (i) => padTop + (usableH * (i + 0.5)) / n;
  const yR = (i) => padTop + (usableH * (i + 0.5)) / m;
  const dotLX = W * 0.40, dotRX = W * 0.62;
  const pairs = []; links.forEach((us, ci) => us.forEach((ui) => pairs.push([ci, ui])));
  const isActiveLink = (ci, ui) => !active ? false : active.side === 'l' ? active.i === ci : active.i === ui;
  const concernActive = (ci) => active && (active.side === 'l' ? active.i === ci : links[ci] && links[ci].includes(active.i));
  const uvpActive = (ui) => active && (active.side === 'r' ? active.i === ui : links[active.i] && links[active.i].includes(ui));
  return (
    <div className="ps-graph" ref={wrapRef} style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {pairs.map(([ci, ui], k) => {
          const on = isActiveLink(ci, ui), dim = active && !on;
          return <path key={k} d={`M ${dotLX} ${yL(ci)} C ${(dotLX + dotRX) / 2} ${yL(ci)}, ${(dotLX + dotRX) / 2} ${yR(ui)}, ${dotRX} ${yR(ui)}`} fill="none" stroke={on ? '#aed7d0' : '#5b9b86'} strokeWidth={on ? 2.2 : 1.2} opacity={dim ? 0.12 : on ? 0.95 : 0.5} style={{ transition: 'all 0.18s' }} />;
        })}
      </svg>
      {concerns.map((c, i) => (
        <React.Fragment key={'l' + i}>
          <div className={'ps-node ps-node-l' + (concernActive(i) ? ' active' : active ? ' dim' : '')} style={{ top: yL(i), left: 0, width: dotLX - 16 }} onMouseEnter={() => setActive({ side: 'l', i })} onMouseLeave={() => setActive(null)}>{c.label}</div>
          <span className={'ps-dot ps-dot-l' + (active && !concernActive(i) ? ' dim' : '')} style={{ top: yL(i), left: dotLX }} />
        </React.Fragment>
      ))}
      {uvps.map((u, i) => (
        <React.Fragment key={'r' + i}>
          <span className={'ps-dot ps-dot-r' + (active && !uvpActive(i) ? ' dim' : '')} style={{ top: yR(i), left: dotRX }} />
          <div className={'ps-node ps-node-r' + (uvpActive(i) ? ' active' : active ? ' dim' : '')} style={{ top: yR(i), left: dotRX + 16, width: W - dotRX - 20 }} onMouseEnter={() => setActive({ side: 'r', i })} onMouseLeave={() => setActive(null)}>{u}</div>
        </React.Fragment>
      ))}
    </div>
  );
}
