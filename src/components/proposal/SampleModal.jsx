import React from 'react';
import { PREVIEW, SAMPLE_FOOT, COLORS } from '../../lib/proposalContent.js';
import { Check, X } from './icons.jsx';

const { useEffect } = React;

// Sidebar sample modals (v3): the annual roadmap, a quarterly playbook, and a
// mini case study (stats + playbook rows). Clearly labelled "sample";
// anonymised data from src/lib/proposalContent.js. Esc / backdrop / × close.
export default function SampleModal({ sample, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!sample) return null;
  const isRoadmap = sample.key === 'roadmap';
  const isCase = sample.key === 'casestudy';
  const showPlaybook = sample.key === 'playbook' || isCase;
  return (
    <div className="pp-scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={sample.title} data-testid="pp-sample-modal">
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bar" style={{ background: sample.color }} />
        <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        <div className="pp-modal-in">
          <div className="eyebrow tag">{sample.tag}</div>
          <h3>{sample.title}</h3>
          <p>{sample.detail}</p>

          {isRoadmap ? (
            <div className="pp-roadmap">
              <div className="head">
                <div><div className="eyebrow k">Annual roadmap · sample</div><div className="t">Every quarter: plan, build, prove</div></div>
                <span className="pill">Plan · Build · Prove</span>
              </div>
              <div className="dots">
                <div className="track" />
                {PREVIEW.quarters.map((q) => (
                  <div key={q.name} className="dotwrap"><div className="dot" style={{ background: q.dot, borderColor: q.done ? q.dot : 'rgba(255,255,255,.35)' }}>{q.done ? <Check size={10} color={COLORS.purple} width={3.5} /> : null}</div></div>
                ))}
              </div>
              <div className="qs">
                {PREVIEW.quarters.map((q) => (
                  <div key={q.name} className="q" style={{ background: q.bg, opacity: q.dim ? 0.55 : 1 }}>
                    <div className="row"><span className="n">{q.name}</span><span className="tag" style={{ background: q.tagBg }}>{q.tag}</span></div>
                    <div className="range">{q.range}</div>
                    <div className="focus">{q.focus}</div>
                    <div className="count"><b>{q.count}</b><span>initiatives</span></div>
                    <div className="bar"><i style={{ width: `${q.pct}%` }} /></div>
                    <div className="del">{q.delivered}</div>
                  </div>
                ))}
              </div>
              <div className="note">{PREVIEW.roadmapNote}</div>
            </div>
          ) : null}

          {isCase ? (
            <>
              <div className="eyebrow pp-sub">What moved · one quarter</div>
              <div className="pp-qstats">
                {PREVIEW.quarterStats.map((s) => <div key={s.label} style={{ borderTopColor: s.color }}><b>{s.value}</b><span>{s.label}</span></div>)}
              </div>
            </>
          ) : null}

          {showPlaybook ? (
            <>
              <div className="eyebrow pp-sub">The playbook · sample quarter</div>
              <div className="pp-pbook">
                <div className="head"><span>{PREVIEW.playbookHead.title}</span><span className="s">{PREVIEW.playbookHead.sub}</span></div>
                {PREVIEW.playbookRows.map((r) => (
                  <div key={r.name} className="r">
                    <div className="nm"><span className="t">{r.name}</span><span className="cat" style={{ background: r.catBg }}>{r.cat}</span></div>
                    <span className="st" style={{ background: r.statusBg }}>{r.status}</span>
                    <div className="pct"><div className="bar"><i style={{ width: `${r.pct}%`, background: r.barColor }} /></div><span>{r.pct}%</span></div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="pp-modal-foot">
            <div className="fine">{SAMPLE_FOOT}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
