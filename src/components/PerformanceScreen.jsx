import React from 'react';
import { DATA } from '../data.js';
import { fetchPerformance } from '../lib/analytics.js';

// ============================================================
// Visibility — client-facing SEO / web-analytics page.
// Ported from the "Web Analytics · Story Scroll" design handoff.
// Blends the live sources into one top-to-bottom narrative: organic traffic,
// Brand Radar (AI search), rankings, traffic sources, paid search, and
// authority/health.
//
// LIVE ONLY — no sample/placeholder numbers. Data comes from the `analytics`
// edge function, keyed by the account's domain. Three states:
//   • loading  → skeleton (PerfSkeleton)
//   • not connected (no website / no key) → empty state (PerfEmpty)
//   • connected → every section that returned data renders; sources that
//     aren't wired yet (currently Brand Radar / GA4 web analytics / Google
//     Ads paid search) are simply omitted rather than faked.
// ============================================================

const A_PURPLE = '#381c4f', A_PINK = '#d9356e', A_YELLOW = '#f5d880',
      A_GREEN = '#2c7d68', A_BLUE = '#2a6391', A_AMBER = '#a8761a';

// ---- path helpers ----
function _pts(data, w, h, pad = 0) {
  const min = Math.min(...data), max = Math.max(...data), span = (max - min) || 1;
  return data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ]);
}
function linePath(data, w, h, pad = 2) {
  return _pts(data, w, h, pad).map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join(' ');
}
function areaPath(data, w, h, pad = 2) {
  const p = _pts(data, w, h, pad);
  const top = p.map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join(' ');
  return `${top} L${(w - pad).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`;
}

// ---- atoms ----
function Sparkline({ data, color = A_PINK, w = 96, h = 30, fill = true, sw = 2 }) {
  const id = React.useMemo(() => 'sg' + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath(data, w, h, 2)} fill={`url(#${id})`} />}
      <path d={linePath(data, w, h, 2)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AreaChart({ data, color = A_PINK, w = 520, h = 150 }) {
  const id = React.useMemo(() => 'ag' + Math.random().toString(36).slice(2, 8), []);
  const pad = 6;
  const p = _pts(data, w, h, pad);
  const last = p[p.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g, i) => <line key={i} x1={pad} x2={w - pad} y1={h * g} y2={h * g} stroke="#ece8f1" strokeWidth="1" />)}
      <path d={areaPath(data, w, h, pad)} fill={`url(#${id})`} />
      <path d={linePath(data, w, h, pad)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

function Donut({ segments, size = 120, stroke = 16, center }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0edf4" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / 100) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} strokeLinecap="butt" />;
          acc += len;
          return el;
        })}
      </svg>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
    </div>
  );
}

function Delta({ v, suffix = '', invert = false }) {
  const up = v >= 0;
  const good = invert ? !up : up;
  const color = good ? A_GREEN : A_PINK;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 800, color }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: up ? 'none' : 'scaleY(-1)' }}><path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {Math.abs(v)}{suffix}
    </span>
  );
}

function ADot({ c, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: c, flexShrink: 0, display: 'inline-block' }} />;
}

// ---- icons (only the ones this page uses) ----
const AIc = {
  search: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  rank: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="7" /><rect x="12" y="7" width="3" height="11" /><rect x="17" y="13" width="3" height="5" /></svg>,
  chart: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>,
  key: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 8.3-8.3M16 5l3 3M14 7l3 3" /></svg>,
  audit: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>,
  radar: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19.07 4.93A10 10 0 1 1 8 2.6" /><path d="M12 12 8 8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="9" opacity="0.4" /></svg>,
  globe: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>,
  check: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  dot: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>,
  money: (p) => <svg width={p.s || 16} height={p.s || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
};

// ---- layout primitives ----
function ABand({ children, style }) {
  return <div style={{ background: '#fff', border: '1px solid #ece8f1', borderRadius: 16, padding: '24px 26px', boxShadow: '0 2px 10px rgba(56,28,79,0.05)', ...style }}>{children}</div>;
}
function ABandHead({ icon, color, bg, kicker, title, takeaway }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 18 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.11em', color, marginBottom: 3 }}>{kicker}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, color: A_PURPLE, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
        {takeaway && <div style={{ fontSize: 13, color: '#6a5c7a', marginTop: 5, lineHeight: 1.45, maxWidth: 760 }}>{takeaway}</div>}
      </div>
    </div>
  );
}

// ---- loading + empty states (shown instead of any placeholder numbers) ----
function Sk({ w = '100%', h = 14, r = 8, style }) {
  return <div className="perf-sk" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
function PerfSkeleton() {
  return (
    <div className="content perf-screen" data-screen-label="05 Performance" style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <Sk w={190} h={38} r={10} />
        <Sk w={160} h={18} r={8} />
        <div style={{ flex: 1 }} />
        <Sk w={190} h={34} r={9} />
      </div>
      <ABand style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[0, 1, 2, 3].map(i => <Sk key={i} h={42} />)}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Sk w={220} h={18} /><Sk h={186} />
          </div>
        </div>
      </ABand>
      {[0, 1].map(i => (
        <ABand key={i} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 13, marginBottom: 18 }}>
            <Sk w={38} h={38} r={10} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Sk w={140} h={12} /><Sk w={260} h={18} /></div>
          </div>
          <Sk h={120} />
        </ABand>
      ))}
    </div>
  );
}
function PerfEmpty({ domain }) {
  return (
    <div className="content perf-screen" data-screen-label="05 Performance" style={{ fontFamily: 'var(--font-body)' }}>
      <ABand style={{ textAlign: 'center', padding: '60px 32px', maxWidth: 560, margin: '40px auto' }}>
        <span style={{ width: 54, height: 54, borderRadius: 14, background: '#f0edf4', color: A_PURPLE, display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><AIc.globe s={26} /></span>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: A_PURPLE, marginBottom: 8 }}>Analytics aren't connected yet</div>
        <div style={{ fontSize: 13.5, color: '#6a5c7a', lineHeight: 1.5 }}>
          {domain
            ? <>We're wiring up live SEO &amp; web analytics for <strong style={{ color: A_PURPLE }}>{domain}</strong>. Your dashboard will fill in as each source comes online.</>
            : <>Once this account's website is connected, your live SEO &amp; web-analytics dashboard appears here — organic traffic, rankings, authority, and more.</>}
        </div>
      </ABand>
    </div>
  );
}

// Window copy for the trend chart, keyed by the timeframe toggle.
const RANGE_META = {
  '30d': { sub: 'last 30 days', ago: '30 days ago', vs: '30 days ago' },
  '90d': { sub: 'last 90 days', ago: '90 days ago', vs: '90 days ago' },
  '12mo': { sub: 'last 12 months', ago: '12 mo ago', vs: 'a year ago' },
  'All': { sub: 'all time', ago: 'start', vs: 'the start' },
};

function PerformanceScreen() {
  const [timeframe, setTimeframe] = React.useState('12mo');
  const [data, setData] = React.useState(null);
  const [pending, setPending] = React.useState(true);
  const acctId = DATA.account?.id;
  React.useEffect(() => {
    let cancelled = false;
    setPending(true);
    // Keep showing the current data while a timeframe switch is in flight, so
    // toggling the range dims the chart rather than flashing the skeleton.
    fetchPerformance(acctId, timeframe).then((d) => { if (!cancelled) { setData(d); setPending(false); } });
    return () => { cancelled = true; };
  }, [acctId, timeframe]);

  if (pending && !data) return <PerfSkeleton />;
  if (!data || !data.configured) return <PerfEmpty domain={data && data.website} />;
  const range = RANGE_META[timeframe] || RANGE_META['12mo'];

  // Live only — each section renders ONLY when its source returned data; an
  // unwired or empty source is omitted rather than backfilled with fake numbers.
  const scorecard = data.scorecard;
  const trafficSeries = data.trafficSeries;
  const organicTraffic = data.organicTraffic;
  const siteExplorer = data.siteExplorer;
  const rankTracker = data.rankTracker;
  const keywords = data.keywords;
  const siteAudit = data.siteAudit;
  const brandRadar = data.brandRadar;
  const webAnalytics = data.webAnalytics;
  const paidSearch = data.paidSearch;
  const domain = data.website;
  // Hero delta + start derive from the live 12-month trend.
  const heroDelta = (trafficSeries && trafficSeries.length > 1 && trafficSeries[0])
    ? Math.round((trafficSeries[trafficSeries.length - 1] - trafficSeries[0]) / trafficSeries[0] * 100) : null;
  const heroStart = (trafficSeries && trafficSeries.length) ? Number(trafficSeries[0]).toLocaleString('en-US') : null;
  const showHero = !!(scorecard || trafficSeries);

  return (
    <div className="content perf-screen" data-screen-label="05 Performance" style={{ fontFamily: 'var(--font-body)' }}>
      {/* header row: domain + live + timeframe toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ece8f1', borderRadius: 10, padding: '9px 14px' }}>
          <AIc.globe s={16} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: A_PURPLE }}>{domain}</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#8a8395' }}>
          <ADot c={A_GREEN} size={7} /> Live data
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid #e0d8ea' }}>
          {['30d', '90d', '12mo', 'All'].map((t, i) => (
            <button key={t} onClick={() => setTimeframe(t)} style={{ fontSize: 11.5, fontWeight: 700, padding: '8px 13px', cursor: 'pointer', border: 'none', background: timeframe === t ? A_PURPLE : '#fff', color: timeframe === t ? '#fff' : '#6a5c7a', borderLeft: i ? '1px solid #e0d8ea' : 'none' }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ opacity: pending ? 0.5 : 1, transition: 'opacity .2s ease', pointerEvents: pending ? 'none' : 'auto' }}>
      {/* HERO — growth story */}
      {showHero && (
      <ABand style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div className="perf-hero-grid" style={{ display: 'grid', gridTemplateColumns: scorecard ? '320px 1fr' : '1fr' }}>
          {scorecard && (
          <div style={{ background: 'linear-gradient(160deg, #faf7fb, #f4eef8)', borderRight: '1px solid #f1eef6', padding: '26px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: A_PINK, marginBottom: 8 }}>At a glance</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 800, color: A_PURPLE, letterSpacing: '-0.01em', lineHeight: 1.25, marginBottom: 20 }}>Your organic engine is compounding.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {scorecard.map(m => (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 6, height: 36, borderRadius: 999, background: m.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8a8395' }}>{m.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: A_PURPLE, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{m.value}</span>
                      <span style={{ fontSize: 11, color: '#a8a0b5' }}>{m.unit}</span>
                    </div>
                  </div>
                  {m.delta != null ? <Delta v={m.delta} suffix={m.deltaSuffix || '%'} /> : null}
                </div>
              ))}
            </div>
          </div>
          )}
          {trafficSeries && (
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: A_PURPLE }}>Organic traffic</div>
                <div style={{ fontSize: 12, color: '#8a8395', marginTop: 1 }}>Organic visits · {range.sub}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: A_PURPLE, letterSpacing: '-0.02em', lineHeight: 1 }}>{organicTraffic || '—'}</span>
                  {heroDelta != null ? <Delta v={heroDelta} /> : null}
                </div>
                {heroStart ? <div style={{ fontSize: 11, color: '#a8a0b5', marginTop: 3 }}>vs {heroStart} {range.vs}</div> : null}
              </div>
            </div>
            <AreaChart data={trafficSeries} color={A_PINK} w={620} h={184} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#b3acc0', fontWeight: 600 }}>
              <span>{range.ago}</span><span /><span>now</span>
            </div>
          </div>
          )}
        </div>
      </ABand>
      )}

      {/* BRAND RADAR */}
      {brandRadar && (
      <div style={{ background: 'linear-gradient(125deg, #381c4f 0%, #290d41 70%)', borderRadius: 16, padding: '26px 28px', marginBottom: 16, color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 14px 36px rgba(56,28,79,0.26)' }}>
        <div style={{ position: 'absolute', right: -50, top: -50, width: 200, height: 200, borderRadius: 999, background: 'radial-gradient(circle, rgba(217,53,110,0.34), transparent 68%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 20 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,216,128,0.16)', color: A_YELLOW, display: 'grid', placeItems: 'center', flexShrink: 0 }}><AIc.radar s={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: A_YELLOW, marginBottom: 3 }}>Brand Radar · our edge</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>You're winning the AI search era</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.66)', marginTop: 5, lineHeight: 1.45, maxWidth: 720 }}>When buyers ask ChatGPT, Google AI, Perplexity or Claude about your category, you're cited {brandRadar.share}% of the time.</div>
            </div>
          </div>
          <div className="perf-radar-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 250px', gap: 18 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 13, padding: '18px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <Donut size={104} stroke={13} segments={[{ value: brandRadar.share, color: A_YELLOW }]} center={
                <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{brandRadar.share}%</div><div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)' }}>SOV</div></div>
              } />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{brandRadar.citations}</span>
                  {brandRadar.citationsDelta != null ? <Delta v={brandRadar.citationsDelta} /> : null}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>AI citations<br />this quarter</div>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 13, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Where you're cited</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {(brandRadar.platforms || []).map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 140, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{p.name}</span>
                    <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: p.share + '%', height: '100%', background: p.color, borderRadius: 999 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, color: '#fff', width: 34, textAlign: 'right' }}>{p.share}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 13, padding: '16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Tracked prompts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(brandRadar.prompts || []).map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{ width: 15, height: 15, borderRadius: 999, background: p.good ? 'rgba(44,125,104,0.3)' : 'rgba(255,255,255,0.1)', color: p.good ? '#7fd9be' : 'rgba(255,255,255,0.4)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>{p.good ? <AIc.check s={9} /> : <AIc.dot s={6} />}</span>
                    <div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', lineHeight: 1.3 }}>"{p.q}"</div><div style={{ fontSize: 10, fontWeight: 700, color: p.good ? '#7fd9be' : 'rgba(255,255,255,0.45)', marginTop: 1 }}>{p.rank}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* RANKINGS */}
      {rankTracker && (
      <ABand style={{ marginBottom: 16 }}>
        <ABandHead icon={<AIc.rank s={19} />} color={A_PINK} bg="#fbe2eb" kicker="Rank Tracker"
          title="Climbing the page-1 ladder" takeaway={`${rankTracker.top3} keywords sit in the top 3 and ${rankTracker.top10} in the top 10 — the searches your buyers actually use.`} />
        <div className="perf-rank-grid" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ n: rankTracker.top3, l: 'in top 3', c: A_GREEN }, { n: rankTracker.top10, l: 'in top 10', c: A_BLUE }, { n: rankTracker.tracked, l: 'tracked total', c: A_PURPLE }].map(s => (
              <div key={s.l} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: s.c, letterSpacing: '-0.02em', width: 56 }}>{s.n}</span>
                <span style={{ fontSize: 12.5, color: '#6a5c7a', fontWeight: 600 }}>{s.l}</span>
              </div>
            ))}
            {rankTracker.top3Series ? (
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid #f1eef6' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a8395', marginBottom: 6 }}>Top-3 keywords over time</div>
                <Sparkline data={rankTracker.top3Series} color={A_GREEN} w={210} h={36} />
              </div>
            ) : null}
          </div>
          <div>
            {(rankTracker.keywords || []).map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #f4f1f8' : 'none' }}>
                <span style={{ fontSize: 13, color: '#43406a', fontWeight: 600 }}>{k.kw}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'start' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: A_PURPLE }}>#{k.pos}</span>
                  {k.prev != null ? <Delta v={k.prev - k.pos} /> : null}
                </span>
                <span style={{ fontSize: 12, color: '#a8a0b5', textAlign: 'right' }}>{k.vol}/mo</span>
              </div>
            ))}
          </div>
        </div>
      </ABand>
      )}

      {/* TRAFFIC SOURCES */}
      {webAnalytics && (
      <ABand style={{ marginBottom: 16 }}>
        <ABandHead icon={<AIc.chart s={19} />} color={A_GREEN} bg="#e2f0ec" kicker="Web Analytics"
          title="Where your visitors come from" takeaway={`${webAnalytics.visits} visits this quarter — most arriving through organic search you don't pay per click for.`} />
        <div className="perf-sources-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em', color: '#a8a0b5', marginBottom: 13 }}>Channels</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Donut size={112} stroke={15} segments={webAnalytics.channels || []} center={<div><div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: A_PURPLE, lineHeight: 1 }}>{webAnalytics.organicPct != null ? webAnalytics.organicPct : ((webAnalytics.channels && webAnalytics.channels[0] && webAnalytics.channels[0].value) || 0)}%</div><div style={{ fontSize: 8.5, color: '#8a8395' }}>organic</div></div>} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {(webAnalytics.channels || []).map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ADot c={c.color} size={8} /><span style={{ flex: 1, fontSize: 11.5, color: '#43406a', fontWeight: 600 }}>{c.name}</span><span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color: A_PURPLE }}>{c.value}%</span></div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em', color: '#a8a0b5', marginBottom: 13 }}>Top locations</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(webAnalytics.geo || []).map(g => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 110, fontSize: 12, color: '#43406a', fontWeight: 600 }}>{g.name}</span>
                  <div style={{ flex: 1, height: 7, background: '#f0edf4', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: g.value * 2 + '%', height: '100%', background: A_BLUE, borderRadius: 999 }} /></div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color: A_PURPLE, width: 30, textAlign: 'right' }}>{g.value}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em', color: '#a8a0b5', marginBottom: 13 }}>Devices</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(webAnalytics.devices || []).map(d => (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 12, color: '#43406a', fontWeight: 600 }}>{d.name}</span><span style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 800, color: A_PURPLE }}>{d.value}%</span></div>
                  <div style={{ height: 7, background: '#f0edf4', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: d.value + '%', height: '100%', background: A_PINK, borderRadius: 999 }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ABand>
      )}

      {/* PAID SEARCH */}
      {paidSearch && (
      <ABand style={{ marginBottom: 16 }}>
        <ABandHead icon={<AIc.money s={19} />} color={A_AMBER} bg="#fbeecb" kicker="Paid Search · Google Ads"
          title="Every ad dollar is pulling its weight" takeaway={`This quarter your ads turned ${paidSearch.spend} of spend into ${paidSearch.leads} qualified leads and ${paidSearch.revenue} in attributed revenue — a ${paidSearch.roas} return.`} />
        <div className="perf-paid-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
          {[
            { label: 'Ad spend', value: paidSearch.spend, sub: 'this quarter', delta: paidSearch.spendDelta, color: A_PURPLE, series: paidSearch.spendSeries },
            { label: 'Qualified leads', value: paidSearch.leads, sub: `${paidSearch.convRate}% conversion rate`, delta: paidSearch.leadsDelta, color: A_GREEN, series: paidSearch.leadsSeries },
            { label: 'Cost per lead', value: paidSearch.costPerLead, sub: 'cost per qualified lead', delta: paidSearch.cplDelta, color: A_BLUE, series: paidSearch.cplSeries, invert: true },
            { label: 'Return on ad spend', value: paidSearch.roas, sub: `${paidSearch.revenue} attributed`, delta: paidSearch.roasDelta, color: A_PINK, hero: true },
          ].map(m => (
            <div key={m.label} style={{ background: m.hero ? 'linear-gradient(160deg, #fdf0f4, #fce6ee)' : '#faf8fc', border: `1px solid ${m.hero ? '#f6cdda' : '#f1eef6'}`, borderRadius: 13, padding: '15px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8a8395' }}>{m.label}</span>
                {m.delta != null ? <Delta v={m.delta} invert={m.invert} /> : null}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: m.hero ? A_PINK : A_PURPLE, letterSpacing: '-0.02em', lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 10.5, color: '#a8a0b5', marginTop: 4, marginBottom: m.series ? 10 : 0 }}>{m.sub}</div>
              {m.series && <Sparkline data={m.series} color={m.color} w={200} h={30} />}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em', color: '#a8a0b5', marginBottom: 4 }}>Campaign performance</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 80px 80px 70px', gap: 12, padding: '10px 0 8px', borderBottom: '1px solid #f1eef6' }}>
          {['Campaign', 'Spend', 'Leads', 'Cost / lead', 'ROAS'].map((h, i) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: '#a8a0b5', textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
          ))}
        </div>
        {(paidSearch.campaigns || []).map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 80px 80px 70px', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: i ? '1px solid #f7f4fb' : 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#43406a', fontWeight: 700 }}>{c.name}</span>
              {c.best && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 7px', borderRadius: 5, background: '#e2f0ec', color: A_GREEN }}>Top</span>}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#43406a', textAlign: 'right' }}>{c.spend}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#43406a', textAlign: 'right' }}>{c.leads}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#43406a', textAlign: 'right' }}>{c.cpl}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 800, color: A_GREEN, textAlign: 'right' }}>{c.roas}</span>
          </div>
        ))}
      </ABand>
      )}

      {/* BOTTOM ROW */}
      {(siteExplorer || siteAudit || keywords) && (
      <div className="perf-bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 16 }}>
        {siteExplorer && (
        <ABand>
          <ABandHead icon={<AIc.search s={18} />} color={A_BLUE} bg="#e6eef5" kicker="Site Explorer" title="Authority & backlinks" />
          <div style={{ display: 'flex', gap: 22, marginBottom: 16 }}>
            <div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: A_PURPLE }}>{siteExplorer.backlinks}</span>{siteExplorer.backlinksDelta != null ? <Delta v={siteExplorer.backlinksDelta} /> : null}</div><div style={{ fontSize: 10.5, color: '#8a8395', marginTop: 2 }}>backlinks</div></div>
            <div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: A_PURPLE }}>{siteExplorer.refDomains}</span>{siteExplorer.refDomainsDelta != null ? <Delta v={siteExplorer.refDomainsDelta} /> : null}</div><div style={{ fontSize: 10.5, color: '#8a8395', marginTop: 2 }}>referring domains</div></div>
          </div>
          {(siteExplorer.topPages || []).length ? <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em', color: '#a8a0b5', marginBottom: 9 }}>Top pages</div> : null}
          {(siteExplorer.topPages || []).slice(0, 4).map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 50px', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid #f4f1f8' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: A_BLUE, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.url}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#43406a', textAlign: 'right' }}>{p.traffic}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: A_GREEN, textAlign: 'right' }}>{p.value}</span>
            </div>
          ))}
        </ABand>
        )}

        {siteAudit && (
        <ABand>
          <ABandHead icon={<AIc.audit s={18} />} color={A_AMBER} bg="#fbeecb" kicker="Site Audit" title="Technical health" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
            <Donut size={108} stroke={14} segments={[{ value: siteAudit.health, color: A_GREEN }]} center={<div><div style={{ fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 800, color: A_PURPLE, lineHeight: 1 }}>{siteAudit.health}</div><div style={{ fontSize: 9, color: '#8a8395' }}>/ 100</div></div>} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {(siteAudit.issues || []).map(it => (
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}><ADot c={it.color} size={9} /><span style={{ flex: 1, fontSize: 12, color: '#43406a', fontWeight: 600 }}>{it.label}</span><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: A_PURPLE }}>{it.count}</span></div>
              ))}
            </div>
          </div>
        </ABand>
        )}

        {keywords && (
        <ABand>
          <ABandHead icon={<AIc.key s={18} />} color={A_PURPLE} bg="#ece8f1" kicker="Keywords Explorer" title="Next opportunities" />
          {keywords.map((k, i) => (
            <div key={i} style={{ padding: '9px 0', borderTop: i ? '1px solid #f4f1f8' : 'none' }}>
              <div style={{ fontSize: 12.5, color: '#43406a', fontWeight: 600, marginBottom: 4 }}>{k.kw}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                <span style={{ color: '#8a8395' }}>{k.vol}/mo</span>
                <span style={{ fontWeight: 800, color: k.kd < 30 ? A_GREEN : A_AMBER }}>KD {k.kd}</span>
                {k.intent && k.intent !== '—' ? <span style={{ color: '#a8a0b5' }}>{k.intent}</span> : null}
              </div>
            </div>
          ))}
        </ABand>
        )}
      </div>
      )}
      </div>
    </div>
  );
}

export default PerformanceScreen;
