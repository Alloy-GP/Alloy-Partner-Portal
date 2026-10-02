import React from 'react';
import { DATA } from '../../data.js';
import { track } from '../../lib/track.js';
import { acceptProposal, requestProposalChanges } from '../../lib/engagement.js';
import { canAcceptProposal, validateAcceptForm, validateChangeRequest, PROPOSAL_AGREEMENT_VERSION } from '../../lib/engagementGate.js';
import { pickPlan, marketsFor, agreementDocument, isExpired, EXPECT_KEYS, FIRST_PLAYBOOK_BUSINESS_DAYS } from '../../lib/proposalPlans.js';
import {
  COVER_INTRO, contactLine, formatPhone, telHref, RESULTS, resultNum, BASELINE, CAPABILITIES, DIFFERENCE, PROGRAMS, YEARS, EXPERTISE,
  PARTNER, partnerBody, HOW_WE_WORK, THAT_IT_WORKS, SAMPLES, NEXT_STEPS_TITLE, STEPS, CTA_LABEL, COLORS,
} from '../../lib/proposalContent.js';
import { ThreadMessage } from '../ThreadMessage.jsx';
import AcceptCard from './AcceptCard.jsx';
import AgreementModal from './AgreementModal.jsx';
import SampleModal from './SampleModal.jsx';
import Investment from './Investment.jsx';
import { ArrowRight, External, Stripes, FileIcon } from './icons.jsx';

const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;
let viewedThisLoad = false;

const Phone = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
const Mail = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>;
const Play = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#381c4f" stroke="#381c4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3 14 9-14 9z" /></svg>;

// ============================================================================
// ProposalPage (v3) — the ONLY thing a new client sees until their owner
// accepts. Shell-less. Cover + floating acceptance card, four numbered
// sections (What you're buying · What to expect · Investment · Next steps),
// sidebar with the sample modals, proof links and the question thread.
// Everything comes from DATA.engagement (engagement_proposals row →
// engagementRowToView) plus the evergreen content in src/lib/proposalContent.js.
// Staff see it through "View as client" (previewOnly): Accept is locked,
// everything else works.
// ============================================================================
export default function ProposalPage({ onAccepted, onSignOut, previewOnly = false, onExitPreview }) {
  const p = DATA.engagement || {};
  const account = DATA.account || {};
  const user = DATA.user || {};
  const company = account.company || account.shortName || 'your company';
  const short = account.shortName || company;
  const plans = p.plans || [];
  const [planKey, setPlanKey] = useState(() => (pickPlan(plans) || {}).key || null);
  const selected = pickPlan(plans, planKey);
  const expired = isExpired(p.validThrough);
  const canAccept = !previewOnly && canAcceptProposal(user);
  const owners = (DATA.team || []).filter((t) => !t.isStaff && t.role === 'owner').map((t) => t.name).filter(Boolean);
  const preparer = p.preparedByName || 'Your Alloy team';
  const preparerFirst = p.preparedByName ? p.preparedByName.split(/\s+/)[0] : 'Your Alloy team';
  const accountLocationNames = (Array.isArray(account.locations) ? account.locations : []).map((l) => (l && l.name) || l).filter(Boolean);
  // Markets = what staff picked for THIS proposal (falls back to the account's locations).
  const locationNames = (p.markets && p.markets.length) ? p.markets : accountLocationNames;
  const { named } = marketsFor(locationNames, selected);
  const show = (k) => !p.sections || p.sections[k] !== false;
  const expectOn = EXPECT_KEYS.some(show);
  const sentDate = p.sentAt ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const sentLong = p.sentAt ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  useEffect(() => {
    if (viewedThisLoad || previewOnly) return;
    viewedThisLoad = true;
    track('proposal_viewed', { proposalId: p.id, version: p.version });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── floating card ↔ sidebar padding ───────────────────────────────────────
  const coverRef = useRef(null); const cardRef = useRef(null); const nameRef = useRef(null);
  const [sidebarPad, setSidebarPad] = useState(174);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const c = coverRef.current, k = cardRef.current;
      if (!c || !k) return;
      if (window.innerWidth <= 960) { setSidebarPad(0); return; }
      setSidebarPad(Math.max(0, 64 + k.offsetHeight - c.offsetHeight) + 24);
    };
    const ro = new ResizeObserver(measure);
    if (coverRef.current) ro.observe(coverRef.current);
    if (cardRef.current) ro.observe(cardRef.current);
    window.addEventListener('resize', measure);
    measure();
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // ── 01 results count-up (once, when the block scrolls into view) ──────────
  const noIO = typeof IntersectionObserver === 'undefined';
  const resultsRef = useRef(null);
  const [seen, setSeen] = useState(noIO);
  const [prog, setProg] = useState(noIO ? 1 : 0);
  useEffect(() => {
    if (seen || noIO || !resultsRef.current) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setSeen(true); io.disconnect();
      const t0 = performance.now(); const dur = 1400;
      const tick = (t) => { const x = Math.min(1, (t - t0) / dur); setProg(1 - Math.pow(1 - x, 3)); if (x < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.35 });
    io.observe(resultsRef.current);
    return () => io.disconnect();
  }, [seen, noIO]);

  // ── acceptance ────────────────────────────────────────────────────────────
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementRead, setAgreementRead] = useState(false);
  const [name, setName] = useState(user.name || '');
  const [title, setTitle] = useState(user.title || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [accepted, setAccepted] = useState(null);
  const selectPlan = (key) => { setPlanKey(key); setAgreementRead(false); if (!previewOnly) track('proposal_plan_selected', { proposalId: p.id, planKey: key }); };
  const agreement = useMemo(() => agreementDocument({
    ref: p.ref, clientLegalName: p.clientLegalName, clientEntityType: p.clientEntityType, clientAddress: p.clientAddress,
    effectiveDate: p.startDate, plan: selected, markets: named, signerName: name, signerTitle: title, spoc: p.spoc, exclusivityMiles: p.exclusivityMiles,
  }), [p.ref, p.clientLegalName, p.clientEntityType, p.clientAddress, p.startDate, p.exclusivityMiles, selected, named.join('|'), name, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const openAgreement = () => { setAgreementOpen(true); if (!previewOnly) track('proposal_agreement_opened', { proposalId: p.id, planKey: selected && selected.key }); };
  const agree = () => { setAgreementOpen(false); setAgreementRead(true); setAcceptOpen(true); if (!previewOnly) track('proposal_agreement_confirmed', { proposalId: p.id }); setTimeout(() => nameRef.current && nameRef.current.focus(), 300); };
  const jumpToAccept = () => {
    setAcceptOpen(true);
    const el = document.getElementById('accept');
    if (el && typeof window !== 'undefined') {
      const y = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setTimeout(() => { if (nameRef.current) nameRef.current.focus(); }, 450);
    }
  };
  const accept = async () => {
    if (previewOnly) { setErr('Staff preview. Only the client’s owner can accept, from their own sign-in.'); return; }
    const v = validateAcceptForm({ name, agree: agreementRead });
    if (!v.ok) { setErr(v.errors.name || v.errors.agree); return; }
    setBusy(true); setErr('');
    try {
      const r = await acceptProposal({ proposalId: p.id, planKey: selected && selected.key, name: name.trim(), title: title.trim(), agreementVersion: PROPOSAL_AGREEMENT_VERSION, agreementRead: true });
      track('proposal_accepted', { proposalId: p.id, version: p.version, planKey: selected && selected.key });
      setAccepted(r.proposal || { accepted_at: new Date().toISOString() });
    } catch (e) { setErr(String((e && e.message) || e || 'Something went wrong. Please try again.')); }
    finally { setBusy(false); }
  };

  // ── thread ────────────────────────────────────────────────────────────────
  const [thread, setThread] = useState(p.thread || []);
  useEffect(() => { setThread(p.thread || []); }, [p.thread]);
  const threadRef = useRef(null);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread.length]);
  const [q, setQ] = useState(''); const [qBusy, setQBusy] = useState(false); const [qErr, setQErr] = useState(''); const [qSent, setQSent] = useState(false);
  const ask = async () => {
    if (previewOnly) { setQErr('Staff preview. Questions come from the client’s own sign-in.'); return; }
    const v = validateChangeRequest(q);
    if (!v.ok) { setQErr(v.error); return; }
    setQBusy(true); setQErr('');
    try {
      const r = await requestProposalChanges({ proposalId: p.id, message: v.message });
      track('proposal_change_requested', { proposalId: p.id });
      const entry = (r && r.request) || { at: new Date().toISOString(), name: user.name || '', role: 'client', message: v.message };
      setThread((t) => [...t, entry]);
      if (DATA.engagement) DATA.engagement.thread = [...(DATA.engagement.thread || []), entry];
      setQSent(true); setQ('');
    } catch (e) { setQErr(String((e && e.message) || e)); }
    finally { setQBusy(false); }
  };

  const [sample, setSample] = useState(null);
  const openSample = (s) => { setSample(s); if (!previewOnly) track('proposal_sample_opened', { proposalId: p.id, sample: s.key }); };
  const steps = STEPS(FIRST_PLAYBOOK_BUSINESS_DAYS);
  const phone = p.preparedByPhone || ''; const email = p.preparedByEmail || '';
  const refLinks = p.referenceLinks || [];
  const vimeo = p.testimonialVimeoId || '';
  const capParts = String(p.testimonialCaption || 'Client testimonial').split(' · ');
  const nav = [
    show('results') ? ['s1', 'What you’re buying'] : null,
    expectOn ? ['s2', 'What to expect'] : null,
    ['s3', 'Investment'],
    show('next') ? ['s4', 'Next steps'] : null,
  ].filter(Boolean);
  const numOf = (id) => String(nav.findIndex((n) => n[0] === id) + 1).padStart(2, '0');
  const floorMuted = !!(selected && !selected.guarantee);

  return (
    <div className="pp" data-testid="proposal-page">
      {previewOnly ? <div role="button" className="pp-preview-bar" onClick={onExitPreview} title="Click to exit client view">👁 Viewing as a client: this is the locked proposal page. Click to exit</div> : null}
      <div className="pp-top">
        <div className="pp-top-in">
          <div className="pp-top-brand"><img src="/assets/alloy-logo-full-color.svg" alt="Alloy" /><div className="pp-top-sep" /><div className="pp-top-for">Proposal for <b>{company}</b></div></div>
          <div className="pp-top-user">{user.name || user.email ? <span>{user.name || user.email}</span> : null}{onSignOut ? <button type="button" onClick={onSignOut}>Sign out</button> : null}</div>
        </div>
      </div>

      {/* ── cover ── */}
      <div className="pp-cover">
        <Stripes />
        <div className="pp-cover-deco"><img src="/alloy-icon.png" alt="" /></div>
        <div className="pp-cover-in" ref={coverRef}>
          <div className="pp-cover-main">
            <div className="pp-cover-eyebrow">
              <span className="eyebrow" style={{ color: '#f5d880' }}>Proposal · v{p.version || 1}</span>
              {sentLong ? <><span className="dot" /><span className="eyebrow" style={{ color: '#a1c8e7' }}>{sentLong}</span></> : null}
            </div>
            <h1>{p.title || `Growth partnership for ${short}.`}</h1>
            <p>{COVER_INTRO}</p>
            <div className="pp-contact" data-testid="pp-contact">
              <div className="q">{contactLine(preparer, { phone, email })}</div>
              {(phone || email) ? (
                <div className="links">
                  {phone ? <a href={telHref(phone)}><Phone />{formatPhone(phone)}</a> : null}
                  {email ? <a href={`mailto:${email}`}><Mail />{email}</a> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="pp-cover-spacer" />
          <AcceptCard
            cardRef={cardRef} plan={selected} company={company} startDate={p.startDate}
            canAccept={canAccept} ownerNames={owners} expired={expired} validThrough={p.validThrough} previewOnly={previewOnly}
            open={acceptOpen} onToggle={() => setAcceptOpen((o) => !o)} agreementRead={agreementRead} onOpenAgreement={openAgreement}
            name={name} title={title} onName={setName} onTitle={setTitle} onAccept={accept} busy={busy} err={err} nameRef={nameRef}
            accepted={!!accepted} acceptedAt={accepted && accepted.accepted_at} preparerFirst={preparerFirst} welcomeCallUrl={p.welcomeCallUrl} onEnterPortal={onAccepted}
          />
        </div>
      </div>

      {/* ── section nav ── */}
      <div className="pp-nav">
        <div className="pp-nav-in">
          {nav.map(([id, t]) => <a key={id} href={`#${id}`}><b>{numOf(id)}</b>{t}</a>)}
        </div>
        <Stripes className="pp-nav-stripes" />
      </div>

      {/* ── body ── */}
      <div className="pp-body">
        <div className="pp-main">
          {show('results') ? (<>
          <div id="s1" className="pp-h2"><span className="num">{numOf('s1')}</span><h2>What you’re buying</h2></div>
          <div className="card pp-pad" data-testid="pp-results">
            <div className="eyebrow pp-eb">{RESULTS.eyebrow}</div>
            <h3 className="pp-h3">{RESULTS.h3}</h3>
            <p className="pp-lead">{RESULTS.p}</p>
            <div className={`pp-results${seen ? ' seen' : ''}`} ref={resultsRef}>
              <Stripes thin />
              <div className="grid">
                {RESULTS.cards.map((c, i) => (
                  <div key={c.key} className={`pp-result${c.guarantee && floorMuted ? ' muted' : ''}`} style={{ transitionDelay: `${i * 120}ms` }} data-testid={`pp-result-${c.key}`}>
                    <div className="k">{c.k}</div>
                    <div className="n" style={{ color: c.color }}>{resultNum(c, prog)}</div>
                    <div className="t">{c.title}</div>
                    <div className="s">{c.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pp-fine">{RESULTS.fine}</div>
          </div>
          </>) : null}

          {expectOn ? (<>
          <div id="s2" className="pp-h2"><span className="num">{numOf('s2')}</span><h2>What to expect</h2></div>
          <div className="card pp-pad" data-testid="pp-expect">
            {show('baseline') ? (
              <div data-testid="pp-baseline">
                <div className="eyebrow pp-eb">{BASELINE.eyebrow}</div>
                <h3 className="pp-h3 big">{BASELINE.h3}</h3>
                <p className="pp-lead tight">{BASELINE.p}</p>
                <div className="pp-caps">
                  {CAPABILITIES.map((c) => <span key={c} className="pp-cap">{c}</span>)}
                  <span className="pp-cap more">{BASELINE.more}</span>
                </div>
              </div>
            ) : null}
            {show('baseline') && (show('programs') || show('expertise') || show('partner')) ? <div className="pp-rule" /> : null}
            {(show('programs') || show('expertise')) ? (
              <>
                <div className="eyebrow pp-eb">{DIFFERENCE.eyebrow}</div>
                <h3 className="pp-h3 big">{DIFFERENCE.h3a}<span className="pink">{DIFFERENCE.h3b}</span></h3>
                <p className="pp-lead tight">{DIFFERENCE.p}</p>
              </>
            ) : null}
            {show('programs') ? (
              <div data-testid="pp-programs">
                <div className="pp-label"><span>{DIFFERENCE.programsLabel}</span><i /></div>
                <div className="pp-programs">
                  {PROGRAMS.map((e) => (
                    <div key={e.key} className="pp-program" data-testid={`pp-program-${e.key}`}>
                      <div className="pp-accent" style={{ background: e.color }} />
                      <div className="who"><div className="nm">{e.name}</div><div className="pr">{e.paren}</div></div>
                      <div className="what"><div className="t">{e.title}</div><div className="d">{e.body}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {show('expertise') ? (
              <div data-testid="pp-expertise">
                <div className="pp-label gap"><span>{YEARS.label}</span><i /></div>
                <p className="pp-lead tight">{YEARS.p}</p>
                <div className="pp-years">
                  <Stripes thin className="top" />
                  <div className="big"><b>{YEARS.num}</b><span>+</span></div>
                  <div className="rest">
                    <div className="lead"><div className="t">{YEARS.title}</div><div className="s">{YEARS.sub}</div></div>
                    <div className="stats">{YEARS.stats.map((s) => <div key={s.l}><b>{s.n}</b><span className="eyebrow">{s.l}</span></div>)}</div>
                  </div>
                </div>
                <div className="pp-grid220">
                  {EXPERTISE.map((x) => <div key={x.title} className="pp-xtile"><div className="pp-accent" style={{ background: x.color }} /><div className="t">{x.title}</div><div className="d">{x.body}</div></div>)}
                </div>
              </div>
            ) : null}
            {show('partner') ? (
              <div data-testid="pp-partner">
                <div className="pp-label gap"><span>{PARTNER.label}</span><i /></div>
                <div className="pp-partner">
                  <div className="pp-accent" style={{ background: COLORS.pink }} />
                  <div className="tx"><div className="t">{PARTNER.title}</div><div className="d">{partnerBody(plans)}</div></div>
                  <img src={PARTNER.logo} alt={PARTNER.logoAlt} />
                </div>
              </div>
            ) : null}
          </div>
          </>) : null}

          <div id="s3" className="pp-h2"><span className="num">{numOf('s3')}</span><h2>Investment &amp; guarantee</h2></div>
          <Investment p={p} plans={plans} selected={selected} onSelect={selectPlan} preparer={preparer} sentDate={sentDate} />

          {show('next') ? (<>
          <div id="s4" className="pp-h2"><span className="num">{numOf('s4')}</span><h2>Next steps</h2></div>
          <div className="pp-next" data-testid="pp-next">
            <Stripes thin />
            <h2>{p.nextStepsTitle || NEXT_STEPS_TITLE}</h2>
            <div className="pp-steps3">
              {steps.map((s) => (
                <div key={s.n} className="pp-step3" style={{ borderTopColor: s.color }}>
                  <div className="n" style={{ color: s.color }}>{s.n}</div>
                  <div className="eyebrow when">{s.when}</div>
                  <div className="t">{s.title}</div>
                </div>
              ))}
            </div>
            <div className="pp-next-foot">
              <div className="q">Questions first? {preparerFirst} answers in the thread on this page.</div>
              {!accepted && !expired && (canAccept || previewOnly) ? <button type="button" className="btn-pill" onClick={jumpToAccept} data-testid="pp-cta">{CTA_LABEL} <ArrowRight /></button> : null}
            </div>
          </div>
          </>) : null}
        </div>

        {/* ── sidebar ── */}
        <div className="pp-side" style={{ paddingTop: sidebarPad }}>
          <div className="pp-side-stick">
          <div className="card pp-side-card" data-testid="pp-proof">
            <div className="eyebrow k">{HOW_WE_WORK.k}</div>
            <div className="t">{HOW_WE_WORK.t}</div>
            <div className="sub">{HOW_WE_WORK.sub}</div>
            <div className="pp-stiles">
              {SAMPLES.slice(0, 2).map((s) => (
                <button type="button" key={s.key} className="pp-stile dark" onClick={() => openSample(s)} data-testid={`pp-sample-${s.key}`}>
                  <span className="ic" style={{ background: s.color }}><FileIcon size={16} /></span>
                  <span className="tx"><span className="t1">{s.title}</span><span className="t2">{s.sub}</span></span>
                  <span className="go"><ArrowRight size={16} /></span>
                </button>
              ))}
            </div>
            <div className="eyebrow k sep">{THAT_IT_WORKS.k}</div>
            <div className="t">{THAT_IT_WORKS.t}</div>
            <div className="pp-stiles">
              {vimeo ? (
                <a className="pp-stile" href={`https://vimeo.com/${vimeo}`} target="_blank" rel="noopener noreferrer" onClick={() => { if (!previewOnly) track('proposal_ref_open', { url: `https://vimeo.com/${vimeo}` }); }} data-testid="pp-testimonial">
                  <span className="ic" style={{ background: COLORS.pinkTint }}><Play /></span>
                  <span className="tx"><span className="t1">{capParts[0]}</span><span className="t2">Video{capParts[1] ? ` · ${capParts.slice(1).join(' · ')}` : ''}</span></span>
                  <span className="go"><External size={14} /></span>
                </a>
              ) : null}
              <button type="button" className="pp-stile" onClick={() => openSample(SAMPLES[2])} data-testid="pp-sample-casestudy">
                <span className="ic" style={{ background: SAMPLES[2].color }}><FileIcon size={16} /></span>
                <span className="tx"><span className="t1">{SAMPLES[2].title}</span><span className="t2">{SAMPLES[2].sub}</span></span>
                <span className="go pink"><ArrowRight size={16} /></span>
              </button>
              {refLinks.map((l) => (
                <a key={l.url} className="pp-stile" href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (!previewOnly) track('proposal_ref_open', { url: l.url }); }}>
                  <span className="ic" style={{ background: COLORS.blueTint }}><FileIcon size={16} /></span>
                  <span className="tx"><span className="t1">{l.label}</span><span className="t2">Document</span></span>
                  <span className="go"><External size={14} /></span>
                </a>
              ))}
            </div>
          </div>

          <div className="card pp-thread-card" data-testid="pp-thread-card">
            <div className="eyebrow k">Questions &amp; changes</div>
            <div className="t">Talk to your Alloy team</div>
            {thread.length ? (
              <div className="eg-thread" ref={threadRef} data-testid="eg-thread" aria-live="polite">
                {thread.map((m, i) => <ThreadMessage key={i} m={m} mine={m.role !== 'staff'} />)}
              </div>
            ) : (
              <div className="empty">Ask anything about this proposal: a change, a date, something unclear. Replies show up right here, and by email.</div>
            )}
            {qSent ? <div className="ok">Sent. Your Alloy team has it.</div> : null}
            <div className="send">
              <textarea className="field" rows={2} value={q} onChange={(e) => { setQ(e.target.value); setQErr(''); setQSent(false); }} placeholder={thread.length ? 'Reply…' : 'A change you’d like, something unclear, a different start date…'} />
              <button type="button" className="btn-outline" onClick={ask} disabled={qBusy || previewOnly} title={previewOnly ? 'Preview only' : undefined}>{qBusy ? '…' : 'Send'}</button>
            </div>
            {qErr ? <div className="pp-err" role="alert">{qErr}</div> : null}
          </div>
          </div>
        </div>
      </div>
      <Stripes className="pp-foot-stripes" />

      {sample ? <SampleModal sample={sample} onClose={() => setSample(null)} /> : null}
      {agreementOpen ? <AgreementModal doc={agreement} onClose={() => setAgreementOpen(false)} onAgree={agree} canAgree={!expired} /> : null}
    </div>
  );
}
