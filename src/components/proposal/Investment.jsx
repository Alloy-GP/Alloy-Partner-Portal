import React from 'react';
import { fmtUSD, planLocLabel, dueAtStart, compareRows, longDate, isExpired } from '../../lib/proposalPlans.js';
import { GUARANTEE } from '../../lib/proposalContent.js';
import { Check } from './icons.jsx';

// §05 Statement of investment: plan header cells (clickable when >1), the
// comparison grid, the terms band, the total card — and the guarantee seal.
export default function Investment({ p, plans, selected, onSelect, preparer, sentDate }) {
  const multi = plans.length > 1;
  const cols = `minmax(0,1.4fr) ${plans.map(() => 'minmax(120px,1fr)').join(' ')}`;
  const rows = compareRows(plans, p.compareRows, { exclusivityMiles: p.exclusivityMiles });
  const expired = isExpired(p.validThrough);
  const anyGuarantee = plans.some((x) => x.guarantee);
  const guaranteePlans = plans.filter((x) => x.guarantee).map((x) => x.name);
  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }} data-testid="pp-investment">
        <div className="pp-soi-head">
          <div className="brand"><img src="/assets/alloy-logo-full-color.svg" alt="Alloy" /><div className="sep" /><div className="t">Statement of investment</div></div>
          <div className="meta">
            <span className="nowrap">{p.ref ? <>No. <b>{p.ref}</b>{sentDate ? ` · ${sentDate}` : ''}</> : sentDate}</span>
            {p.validThrough ? <span className={`pp-valid${expired ? ' expired' : ''}`}>{expired ? 'Expired' : 'Valid through'} {longDate(p.validThrough)}</span> : null}
          </div>
        </div>
        <div className="pp-grid">
          <div className="pp-plan-head" style={{ gridTemplateColumns: cols }}>
            <div className="pp-plan-prompt">{multi ? 'Choose a plan' : 'Your plan'}</div>
            {plans.map((pl) => {
              const on = selected && pl.key === selected.key;
              return (
                <button type="button" key={pl.key} className={`pp-plan${on ? ' is-on' : ''}${multi ? '' : ' single'}`} onClick={() => multi && onSelect(pl.key)} aria-pressed={on} data-testid={`pp-plan-${pl.key}`}>
                  {pl.recommended && multi ? <div className="rec">Recommended</div> : null}
                  <div className="n">{pl.name}</div>
                  <div className="p"><b>{fmtUSD(pl.monthly)}</b><span>/ mo</span></div>
                  <div className="tg">{pl.tagline || planLocLabel(pl)}</div>
                </button>
              );
            })}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="pp-row" style={{ gridTemplateColumns: cols }}>
              <div className="lbl"><div className="t">{r.label}</div>{r.note ? <div className="d">{r.note}</div> : null}</div>
              {r.cells.map((c, i) => (
                <div key={i} className={`pp-cell${r.strong ? ' strong' : ''}`}>
                  {c.kind === 'check' ? <span className="pp-check"><Check size={12} color="#381c4f" /></span> : c.kind === 'dash' ? <span className="pp-dash" /> : c.text}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="pp-terms">
          <div className="pp-facts">
            <div className="pp-fact"><div className="k">Start</div><div className="v">{p.startDate ? longDate(p.startDate) : 'On acceptance'}</div></div>
            <div className="pp-fact"><div className="k">Billing</div><div className="v">ACH autopay</div><div className="s">On the 1st, monthly</div></div>
            <div className="pp-fact"><div className="k">Valid through</div><div className="v">{p.validThrough ? longDate(p.validThrough) : '—'}</div>{expired ? <div className="s" style={{ color: '#d9356e' }}>Ask us to refresh it</div> : null}</div>
            <div className="pp-fact"><div className="k">Prepared by</div><div className="v">{preparer}</div><div className="s">Alloy Growth Partners</div></div>
          </div>
          {selected ? (
            <div className="pp-total" data-testid="pp-total">
              <div className="k">{selected.name} · {planLocLabel(selected)}</div>
              <div className="big">{fmtUSD(dueAtStart(selected))}</div>
              <div className="due">Due at start</div>
              <hr />
              <div className="line"><span>First month</span><b>{fmtUSD(selected.monthly)}</b></div>
              <div className="line"><span>One-time setup</span><b>{fmtUSD(selected.setup)}</b></div>
              <div className="then">Then {fmtUSD(selected.monthly)} monthly · {selected.termMonths} months</div>
            </div>
          ) : null}
        </div>
      </div>

      {anyGuarantee ? (
        <div className={`card pp-guar${selected && !selected.guarantee ? ' muted' : ''}`} data-testid="pp-guarantee">
          <div className="pp-seal">
            <svg viewBox="0 0 200 200" width="168" height="168" style={{ display: 'block' }} aria-hidden="true">
              <defs>
                <path id="ppSealTop" d="M 53.33,146.67 A 66,66 0 1 1 146.67,146.67" />
                <path id="ppSealBot" d="M 53.33,53.33 A 66,66 0 1 0 146.67,53.33" />
              </defs>
              <circle cx="100" cy="100" r="98" fill="#290d41" />
              <circle cx="100" cy="100" r="94" fill="none" stroke="#f5d880" strokeWidth="1" />
              <circle cx="100" cy="100" r="82" fill="none" stroke="#f5d880" strokeWidth="0.75" opacity="0.7" />
              <circle cx="100" cy="100" r="48" fill="#381c4f" stroke="#f5d880" strokeWidth="1" />
              <text fontFamily="Gotham, Poppins, sans-serif" fontSize="10" fontWeight="700" fill="#f5d880" style={{ letterSpacing: '1.6px' }}><textPath href="#ppSealTop" startOffset="50%" textAnchor="middle" dominantBaseline="middle">ALLOY GROWTH PARTNERS</textPath></text>
              <text fontFamily="Gotham, Poppins, sans-serif" fontSize="10" fontWeight="700" fill="#f5d880" style={{ letterSpacing: '2.2px' }}><textPath href="#ppSealBot" startOffset="50%" textAnchor="middle" dominantBaseline="middle">RESULTS GUARANTEE</textPath></text>
              <circle cx="34.2" cy="105" r="2.2" fill="#d9356e" /><circle cx="165.8" cy="105" r="2.2" fill="#d9356e" />
              <path d="M79 101 L94 116 L123 86" fill="none" stroke="#f5d880" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="pp-guar-text">
            <div className="eyebrow">{GUARANTEE.eyebrow}</div>
            <h2>{GUARANTEE.h1}<br /><span>{GUARANTEE.h2}</span></h2>
            <p>{GUARANTEE.body}</p>
            <div className="note">{selected && !selected.guarantee ? `Included with the ${guaranteePlans.join(' and ')} plan${guaranteePlans.length === 1 ? '' : 's'}. ` : ''}{GUARANTEE.note}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
