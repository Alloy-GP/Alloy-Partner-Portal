import React from 'react';
import { fmtUSD, planLocLabel, dueAtStart, compareRows, longDate, isExpired, planFuel, ALLOY_LEGAL } from '../../lib/proposalPlans.js';
import { GUARANTEE, PARTNER } from '../../lib/proposalContent.js';
import { Check } from './icons.jsx';

// §03 Statement of investment (v3): plan header cells with the Fuel bar
// (clickable when >1), the comparison grid (check / dash / text / match HOA
// logo), "Your terms", the due-at-start band, and the guarantee seal.
export default function Investment({ p, plans: allPlans, selected, onSelect, preparer, sentDate }) {
  const plans = (allPlans || []).filter((x) => x.show !== false);
  const multi = plans.length > 1;
  const cols = `minmax(150px,1.3fr) ${plans.map(() => 'minmax(124px,1fr)').join(' ')}`;
  const rows = compareRows(plans, p.compareRows, { exclusivityMiles: p.exclusivityMiles, customRows: p.customRows });
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
                  <div className="p"><b>{fmtUSD(pl.monthly)}</b><span>/mo</span></div>
                  <div className="tg">{pl.tagline || planLocLabel(pl)}</div>
                  <div className="fuel-k">Fuel</div>
                  <div className="fuel"><i style={{ width: `${planFuel(pl, plans)}%` }} /></div>
                </button>
              );
            })}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="pp-row" style={{ gridTemplateColumns: cols }}>
              <div className="lbl"><div className="t">{r.label}</div>{r.note ? <div className="d">{r.note}</div> : null}</div>
              {r.cells.map((c, i) => (
                <div key={i} className={`pp-cell${r.strong ? ' strong' : ''}`}>
                  {c.kind === 'logo' ? <img className="pp-logo-cell" src={PARTNER.logo} alt={PARTNER.logoAlt} />
                    : c.kind === 'check' ? <span className="pp-check"><Check size={12} color="#381c4f" /></span>
                    : c.kind === 'dash' ? <span className="pp-dash" /> : c.text}
                </div>
              ))}
            </div>
          ))}
          <div style={{ height: 24 }} />
        </div>
        <div className="pp-terms" data-testid="pp-terms">
          <div className="pp-terms-k">Your terms{selected ? ` · ${selected.name}` : ''}</div>
          <div className="pp-trow"><div className="lbl"><div className="t">Start</div><div className="d">Foundation begins the day we start.</div></div><div className="v">{p.startDate ? longDate(p.startDate) : 'On acceptance'}</div></div>
          <div className="pp-trow"><div className="lbl"><div className="t">Billing</div><div className="d">Set up right after you accept.</div></div><div className="v">ACH autopay, on the 1st of each month</div></div>
          <div className="pp-trow last"><div className="lbl"><div className="t">Prepared by</div><div className="d">Your Alloy partner.</div></div><div className="v">{preparer} <span>· {ALLOY_LEGAL.brand}</span></div></div>
        </div>
        {selected ? (
          <div className="pp-due" data-testid="pp-total">
            <div className="left">
              <div className="k">Due at start · {selected.name}</div>
              <div className="big">{fmtUSD(dueAtStart(selected))}</div>
              <div className="then">Then {fmtUSD(selected.monthly)} monthly for {selected.termMonths} months. Discounts already applied.</div>
            </div>
            <div className="right">
              <div className="line"><span>First month</span><b>{fmtUSD(selected.monthly)}</b></div>
              <div className="line"><span>One-time setup</span><b>{fmtUSD(selected.setup)}</b></div>
              <div className="line total"><span>Total due at start</span><b>{fmtUSD(dueAtStart(selected))}</b></div>
            </div>
          </div>
        ) : null}
      </div>

      {anyGuarantee ? (
        <div className={`card pp-guar${selected && !selected.guarantee ? ' muted' : ''}`} data-testid="pp-guarantee">
          <div className="pp-seal">
            <svg viewBox="0 0 200 200" width="168" height="168" style={{ display: 'block' }} aria-hidden="true">
              <path d="M 105.49 10.17 A 90 90 0 0 1 183.74 67.01" fill="none" stroke="#d9356e" strokeWidth="7" strokeLinecap="round" /><path d="M 187.13 77.47 A 90 90 0 0 1 157.25 169.45" fill="none" stroke="#f5d880" strokeWidth="7" strokeLinecap="round" /><path d="M 148.36 175.91 A 90 90 0 0 1 51.64 175.91" fill="none" stroke="#a1c8e7" strokeWidth="7" strokeLinecap="round" /><path d="M 42.75 169.45 A 90 90 0 0 1 12.87 77.47" fill="none" stroke="#aed7d0" strokeWidth="7" strokeLinecap="round" /><path d="M 16.26 67.01 A 90 90 0 0 1 94.51 10.17" fill="none" stroke="#381c4f" strokeWidth="7" strokeLinecap="round" />
              <circle cx="100" cy="100" r="74" fill="#381c4f" />
              <defs><path id="ppSealRing" d="M 100,100 m -58,0 a 58,58 0 1,1 116,0 a 58,58 0 1,1 -116,0" /></defs>
              <text fontFamily="Gotham, Poppins, sans-serif" fontSize="11.5" fontWeight="700" fill="#ffffff" style={{ letterSpacing: '3.2px' }}><textPath href="#ppSealRing" startOffset="0">GUARANTEED · RESULTS · GUARANTEED · RESULTS · </textPath></text>
              <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
              <path d="M80 101 L94 115 L122 85" fill="none" stroke="#f5d880" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
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
