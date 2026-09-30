import React from 'react';
import { STAGES, PREVIEW, COLORS } from '../../lib/proposalContent.js';
import { Check, X } from './icons.jsx';

const { useEffect } = React;

// "How we do it" modal: one topic, its detail, an optional portal preview
// (clearly labelled sample), the "what you can expect" rows, and the markets
// it runs in. Esc / backdrop / × close.
export default function TopicModal({ topic, markets, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!topic) return null;
  const chipBg = [COLORS.yellowTint, COLORS.blueTint, COLORS.greenTint, COLORS.pinkTint, '#ece8f1'];
  const marketColors = [COLORS.yellow, COLORS.blue, COLORS.green, COLORS.pink, COLORS.purple80];
  const named = (markets || []).slice(0, 5);
  return (
    <div className="pp-scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={topic.title} data-testid="pp-topic-modal">
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bar" style={{ background: topic.color }} />
        <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        <div className="pp-modal-in">
          <div className="eyebrow tag">{topic.tag}</div>
          <h3>{topic.title}</h3>
          <p>{topic.detail}</p>

          {topic.key === 'journey' ? (
            <>
              <div className="eyebrow pp-sub">The five stages</div>
              <div className="pp-stages">
                <div className="track" />
                {STAGES.map((st) => (
                  <div key={st.n} className="pp-stage">
                    <div className="dot" style={{ background: st.color, color: st.fg }}>{st.n}</div>
                    <div className="n">{st.name}</div>
                    <div className="g">{st.goal}</div>
                  </div>
                ))}
              </div>
              {named.length ? (
                <div className="pp-tracks">
                  <div className="t">Same journey, {named.length === 1 ? 'one track' : `${named.length} tracks`}</div>
                  {named.map((m, i) => (
                    <div key={m} className="pp-track">
                      <div className="nm"><i style={{ background: marketColors[i % marketColors.length] }} />{m}</div>
                      <div className="line">{STAGES.map((st) => <span key={st.n}><i style={{ borderColor: st.color }} /><em /></span>)}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {topic.key === 'reporting' ? (
            <>
              <div className="eyebrow pp-sub">A peek at the 90-day roadmap</div>
              <div style={{ background: COLORS.purple, borderRadius: 10, padding: 18, marginBottom: 24, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: COLORS.yellow }}>Program roadmap · sample</div><div style={{ fontSize: 15, fontWeight: 800 }}>Every quarter: plan, build, prove</div></div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,.25)' }}>Plan · Build · Prove</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', position: 'relative', marginBottom: 14 }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 2, background: 'rgba(255,255,255,.18)' }} />
                  {PREVIEW.quarters.map((q) => (
                    <div key={q.name} style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 999, background: q.dot, border: `2px solid ${q.done ? q.dot : 'rgba(255,255,255,.35)'}`, boxShadow: `0 0 0 4px ${COLORS.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{q.done ? <Check size={10} color={COLORS.purple} width={3.5} /> : null}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
                  {PREVIEW.quarters.map((q) => (
                    <div key={q.name} style={{ background: q.bg, borderRadius: 8, padding: 12, minWidth: 0, opacity: q.dim ? 0.55 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}><span style={{ fontSize: 16, fontWeight: 800, color: COLORS.purple }}>{q.name}</span><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999, background: q.tagBg, color: COLORS.purple, whiteSpace: 'nowrap' }}>{q.tag}</span></div>
                      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 10 }}>{q.range}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><span style={{ fontSize: 20, fontWeight: 800, color: COLORS.purple, lineHeight: 1 }}>{q.count}</span><span style={{ fontSize: 10, color: COLORS.body }}>initiatives</span></div>
                      <div style={{ marginTop: 8, height: 5, borderRadius: 999, background: '#ece8f1', overflow: 'hidden' }}><div style={{ height: '100%', width: `${q.pct}%`, background: COLORS.green }} /></div>
                      <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: COLORS.purple }}>{q.delivered}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: COLORS.borderStrong, lineHeight: 1.5 }}>Each quarter closes with a playbook for the next one and a report on this one — both linked right here, both in plain language.</div>
              </div>
            </>
          ) : null}

          {topic.key === 'leads' ? (
            <>
              <div className="eyebrow pp-sub">A peek at your lead queue</div>
              <div className="pp-preview">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0, background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: COLORS.pink, color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{PREVIEW.leadRows.length}</span>
                      <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: COLORS.pinkTint }}>Live · sample</div><div style={{ fontSize: 13, fontWeight: 700 }}>Leads waiting on you</div></div>
                    </div>
                    {PREVIEW.leadRows.map((l) => (
                      <div key={l.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderTop: `1px solid ${COLORS.lightGray}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name} <span style={{ fontWeight: 500, color: COLORS.body }}>· {l.assoc}</span></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: COLORS.muted }}><span style={{ width: 7, height: 7, borderRadius: 2, background: l.srcColor }} />{l.src} · {named[PREVIEW.leadRows.indexOf(l) + 1] || l.market} · {l.units} units</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 8, background: COLORS.purple, color: '#fff' }}>Qualify</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, padding: 14 }}><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: COLORS.muted }}>Qualified boards · this year</div><div style={{ fontSize: 30, fontWeight: 800, color: COLORS.purple, lineHeight: 1, marginTop: 6 }}>19</div></div>
                    <div style={{ background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, padding: 14 }}><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: COLORS.muted }}>Pipeline value</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}><span style={{ fontSize: 30, fontWeight: 800, color: COLORS.pink, lineHeight: 1 }}>$73K</span><span style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>/yr</span></div></div>
                    <div style={{ background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8 }}>Where boards come from</div>
                      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2 }}>{PREVIEW.sources.map((s) => <div key={s.label} style={{ flex: s.pct, background: s.color }} />)}</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 11, fontWeight: 700, color: COLORS.purple }}>{PREVIEW.sources.filter((s) => s.pct > 5).map((s) => <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />{s.label} {s.pct}%</span>)}</div>
                    </div>
                  </div>
                </div>
                <div className="cap">Every board that reaches out lands here with its source and market attached. One tap marks it qualified, and the value follows it through to a signed contract.</div>
              </div>
            </>
          ) : null}

          {topic.key === 'playbook' ? (
            <>
              <div className="eyebrow pp-sub">A peek at a live playbook</div>
              <div className="pp-preview">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/alloy-icon.png" alt="" style={{ width: 22, height: 22, borderRadius: 6 }} /><span style={{ fontSize: 15, fontWeight: 800, color: COLORS.purple }}>Playbook</span><span style={{ fontSize: 11, color: COLORS.muted }}>· sample quarter</span></div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: COLORS.pink, color: '#fff' }}>New request</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                  {[['Waiting on you', '2', 'leads to qualify', COLORS.yellow], ['Quarter complete', '98%', 'On track', COLORS.green], ['Delivered · added', '75', '+14 added free', COLORS.blue]].map(([k, n, s, c]) => (
                    <div key={k} style={{ background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderTop: `3px solid ${c}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: COLORS.muted }}>{k}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}><span style={{ fontSize: 24, fontWeight: 800, color: COLORS.purple, lineHeight: 1 }}>{n}</span><span style={{ fontSize: 12, fontWeight: 700, color: k.startsWith('Delivered') ? COLORS.pink : COLORS.purple }}>{s}</span></div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#fff', border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: COLORS.blueTint, fontSize: 12, fontWeight: 700, color: COLORS.purple }}><span>Projects we’re driving</span><span style={{ fontSize: 11, color: COLORS.body, fontWeight: 500 }}>4 in motion · 75 delivered</span></div>
                  {PREVIEW.playbookRows.map((r) => (
                    <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${COLORS.lightGray}` }}>
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: r.catBg, color: COLORS.purple, whiteSpace: 'nowrap' }}>{r.cat}</span></div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: r.statusBg, color: COLORS.purple, whiteSpace: 'nowrap' }}>{r.status}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 110 }}><div style={{ flex: 1, height: 6, borderRadius: 999, background: '#ece8f1', overflow: 'hidden' }}><div style={{ height: '100%', width: `${r.pct}%`, background: r.barColor }} /></div><span style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, width: 34, textAlign: 'right' }}>{r.pct}%</span></div>
                    </div>
                  ))}
                </div>
                <div className="cap">Every task we run is visible here — status, category, due date and progress — so you never have to ask what we did this month.</div>
              </div>
            </>
          ) : null}

          <div className="eyebrow pp-sub">What you can expect</div>
          <div className="pp-expect">{topic.expect.map((m) => <div key={m}><i style={{ background: topic.color }} />{m}</div>)}</div>
          <div className="pp-modal-foot">
            <div className="scope">
              <span className="l">{topic.scopeLabel}</span>
              {topic.perMarket && named.length ? named.map((m, i) => <span key={m} className="pp-mchip" style={{ background: chipBg[i % chipBg.length] }}>{m}</span>) : null}
              {!topic.perMarket ? <span className="pp-mchip" style={{ background: '#ece8f1' }}>{named.length ? `all ${named.length} market${named.length === 1 ? '' : 's'}` : 'every market'}</span> : null}
            </div>
            <div className="portal">{topic.portal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
