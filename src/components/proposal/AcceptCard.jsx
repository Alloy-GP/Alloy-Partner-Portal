import React from 'react';
import { fmtUSD, planLocLabel, longDate } from '../../lib/proposalPlans.js';
import { PROPOSAL_AGREEMENT_VERSION } from '../../lib/engagementGate.js';
import { ArrowRight, Chevron, Check, FileIcon, Stripes } from './icons.jsx';

// The floating acceptance card (v3). States:
//   summary (plan · price · setup/term/billing)  →  pink band  →  form (read &
//   confirm, sign)  →  accepted
// Variants: non-owner (summary + "your owner accepts"), expired (band disabled),
// staff preview (form visible, Accept locked). Everything money-related reads
// the SELECTED plan so switching plans in §03 updates here instantly.
export default function AcceptCard({
  cardRef, plan, company, startDate, canAccept, ownerNames, expired, validThrough, previewOnly,
  open, onToggle, agreementRead, onOpenAgreement, name, title, onName, onTitle, onAccept, busy, err,
  accepted, acceptedAt, preparerFirst, welcomeCallUrl, onEnterPortal, nameRef,
}) {
  const hasName = String(name || '').trim().length > 1;
  const ready = hasName && agreementRead;
  const doneCount = (agreementRead ? 1 : 0) + (hasName ? 1 : 0);
  const first = (String(name || '').trim().split(/\s+/)[0]) || 'there';
  const signedAs = `${String(name || '').trim()}${String(title || '').trim() ? `, ${String(title).trim()}` : ''}`;

  if (accepted) {
    return (
      <div id="accept" ref={cardRef} className="pp-accept" data-testid="pp-accept">
        <Stripes thin onWhite />
        <div className="pp-accepted" data-testid="pp-accepted">
          <div className="ok"><Check size={26} color="#381c4f" width={3} /></div>
          <div className="eyebrow">Accepted · {longDate(acceptedAt || new Date().toISOString())}</div>
          <h3>Welcome aboard, {first}.</h3>
          <p>{preparerFirst} has been notified. Your portal is live{startDate ? `, and Foundation starts ${longDate(startDate)}` : ''}.</p>
          <div className="list">
            <div><i style={{ background: '#aed7d0' }} />Proposal signed by {signedAs}</div>
            <div><i style={{ background: '#f5d880' }} />Next: add a bank account for autopay</div>
            <div className={welcomeCallUrl ? '' : 'dim'}><i style={{ background: welcomeCallUrl ? '#a1c8e7' : 'rgba(255,255,255,.3)' }} />{welcomeCallUrl ? 'Kickoff call: pick a time below' : `Kickoff call: ${preparerFirst} will propose times`}</div>
          </div>
          <button type="button" className="btn-pill" onClick={onEnterPortal} data-testid="pp-enter-portal">Open your portal <ArrowRight /></button>
          {welcomeCallUrl ? <div className="cal"><a href={welcomeCallUrl} target="_blank" rel="noopener noreferrer">Schedule your kickoff call ↗</a></div> : null}
        </div>
      </div>
    );
  }

  return (
    <div id="accept" ref={cardRef} className="pp-accept" data-testid="pp-accept">
      <Stripes thin onWhite />
      <div className="pp-accept-sum">
        <div className="row">
          <div className="eyebrow plan">{plan ? `${plan.name} · ${planLocLabel(plan)}` : 'Your plan'}</div>
          <div className="starts">{startDate ? `Starts ${longDate(startDate).replace(/, \d{4}$/, '')}` : ''}</div>
        </div>
        <div className="price"><b>{fmtUSD(plan ? plan.monthly : 0)}</b><span>/ month</span></div>
        <div className="pp-accept-mini">
          <div><div className="k">Setup</div><div className="v">{fmtUSD(plan ? plan.setup : 0)}</div></div>
          <div><div className="k">Term</div><div className="v">{plan ? `${plan.termMonths} months` : '—'}</div></div>
          <div><div className="k">Billing</div><div className="v">ACH autopay</div></div>
        </div>
      </div>

      {expired ? (
        <div className="pp-band is-disabled" data-testid="pp-expired">
          <div><div className="t">This proposal has expired</div><div className="s">It was valid through {longDate(validThrough)}. Ask your Alloy team in the thread to refresh it.</div></div>
        </div>
      ) : !canAccept && !previewOnly ? (
        <div className="pp-note" data-testid="pp-owner-note">Your account owner{ownerNames && ownerNames.length ? ` (${ownerNames.join(', ')})` : ''} accepts on behalf of {company}. You can read everything here and send questions from the thread.</div>
      ) : (
        <>
          <button type="button" className={`pp-band${open ? ' is-open' : ''}`} onClick={onToggle} data-testid="pp-band">
            <div>
              <div className="t">Review terms and accept</div>
              <div className="s">{open ? (ready ? 'Ready. Hit accept below.' : `${doneCount} of 2 steps done`) : 'Read the agreement, sign your name. Two minutes.'}</div>
            </div>
            <span className="arrow"><Chevron /></span>
          </button>
          {open ? (
            <>
              <div className="pp-progress"><i className={ready ? 'ready' : ''} style={{ width: ready ? '100%' : doneCount === 1 ? '50%' : '6%' }} /></div>
              <div className="pp-form" data-testid="pp-form">
                {previewOnly ? <div className="pp-note warn" style={{ margin: '-24px -26px 18px', borderTop: 0 }}><b>Staff preview.</b> This is what the client’s owner sees. Only they can accept, from their own sign-in.</div> : null}
                <div className="pp-steps">
                  <div className="pp-step-rail"><div className={`pp-step-dot ${agreementRead ? 'done' : 'active'}`}>{agreementRead ? '✓' : '1'}</div><div className="pp-step-line" /></div>
                  <div className="pp-step-body gap">
                    <div className="pp-step-t">Read and confirm the agreement</div>
                    <div className="pp-step-s">{agreementRead ? 'Confirmed · open again or download a PDF' : 'Required before you can accept'}</div>
                    <button type="button" className={`btn-outline${agreementRead ? '' : ' solid'}`} onClick={onOpenAgreement} data-testid="pp-read"><FileIcon />{agreementRead ? 'Open agreement' : 'Read & confirm'}</button>
                  </div>
                  <div className="pp-step-rail"><div className={`pp-step-dot ${hasName ? 'done' : agreementRead ? 'active' : ''}`}>{hasName ? '✓' : '2'}</div></div>
                  <div className="pp-step-body">
                    <div className="pp-step-t">Sign and accept</div>
                    <div className="pp-inputs">
                      <input ref={nameRef} className="field" value={name} onChange={(e) => onName(e.target.value)} placeholder="Full name" autoComplete="name" data-testid="pp-name" />
                      <input className="field" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Title (optional)" autoComplete="organization-title" />
                    </div>
                    <button type="button" className={`pp-accept-btn${ready && !previewOnly ? ' ready' : ''}`} disabled={!ready || busy || previewOnly} onClick={onAccept} data-testid="pp-accept-btn">
                      {busy ? 'Accepting…' : 'Accept proposal'} <ArrowRight />
                    </button>
                    <div className="pp-hint">{previewOnly ? 'Preview only.' : ready ? 'Nothing is billed until autopay is set up.' : !agreementRead ? 'Read the agreement to unlock.' : 'Add your name to unlock.'}</div>
                    {err ? <div className="pp-err" role="alert">{err}</div> : null}
                    <div className="pp-consent">By accepting you agree, on behalf of {company}, to the {plan ? plan.name : ''} plan at {fmtUSD(plan ? plan.monthly : 0)}/month{plan && plan.setup ? ` plus a one-time ${fmtUSD(plan.setup)} setup` : ''}, and authorize Alloy to begin. Billing is by ACH autopay, set up next. Agreement {PROPOSAL_AGREEMENT_VERSION}.</div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
