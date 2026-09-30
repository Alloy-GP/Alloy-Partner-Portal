import React from 'react';
import { ALLOY_LEGAL } from '../../lib/proposalPlans.js';
import { ArrowRight, Download, X, Stripes } from './icons.jsx';

const { useEffect } = React;

// The service agreement, rendered from agreementDocument() for the SELECTED
// plan and the name typed so far. "I've read it and agree" marks step 1 done.
// Download opens a print-ready copy (the browser's Save as PDF); the signed
// record is the server-side snapshot taken at acceptance.
export default function AgreementModal({ doc, onClose, onAgree, canAgree = true }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    const el = document.getElementById('pp-agreement-doc');
    if (!el || typeof window === 'undefined' || !window.open) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Alloy Service Agreement ${doc.ref || ''}</title><style>body{font-family:Gotham,Poppins,Helvetica,Arial,sans-serif;margin:48px;color:#555;line-height:1.6}h3{color:#381c4f}b,strong{color:#381c4f}@page{margin:.75in}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* user closed */ } }, 300);
  };

  return (
    <div className="pp-scrim agreement pp-agree" onClick={onClose} role="dialog" aria-modal="true" aria-label="Service agreement" data-testid="pp-agreement">
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <Stripes thin onWhite />
        <div className="pp-agree-head">
          <div className="brand"><img src="/assets/alloy-logo-full-color.svg" alt="Alloy" /><div className="sep" /><div className="t">Service Agreement</div></div>
          <div className="acts">
            <button type="button" className="btn-outline" onClick={download}><Download />Download PDF</button>
            <button type="button" className="close" onClick={onClose} aria-label="Close"><X /></button>
          </div>
        </div>
        <div id="pp-agreement-doc" className="pp-agree-doc">
          <div className="eyebrow" style={{ color: '#d9356e', marginBottom: 10 }}>Agreement{doc.ref ? ` · ${doc.ref}` : ''}</div>
          <h3>{ALLOY_LEGAL.short} &amp; {doc.legalName} Service Agreement</h3>
          <div className="parties">{ALLOY_LEGAL.name} and {doc.legalName} · Effective {doc.effective}</div>
          <div className="pp-facts-grid">
            {doc.facts.map((f) => <div key={f.k}><div className="k">{f.k}</div><div className="v">{f.v}</div></div>)}
          </div>
          <p className="pre">{doc.preamble}</p>
          {doc.sections.map((s) => (
            <div key={s.n} className="pp-sec">
              <div className="h">{s.n}. {s.title}</div>
              {s.body ? <p>{s.body}</p> : null}
              {(s.subs || []).map((ss) => <div key={ss.n} className="sub"><p><b>{ss.n} {ss.title}</b> {ss.body}</p></div>)}
            </div>
          ))}
          <p className="closing">{doc.closing}</p>
          <div className="pp-sign">
            <div><div className="k">For {doc.legalName}</div><div className="line" /><div className="who">{doc.signer}</div></div>
            <div><div className="k">For {ALLOY_LEGAL.name}</div><div className="line" /><div className="who">{ALLOY_LEGAL.signer}</div></div>
          </div>
        </div>
        <div className="pp-agree-foot">
          <div className="n">Confirming here, then accepting online, has the same effect as signing.</div>
          {canAgree ? <button type="button" className="btn-pill" onClick={onAgree} data-testid="pp-agree">I’ve read it and agree <ArrowRight size={14} /></button> : <button type="button" className="btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}
