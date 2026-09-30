import React from 'react';
import { DATA } from '../../data.js';
import { track } from '../../lib/track.js';
import { acceptProposal, requestProposalChanges } from '../../lib/engagement.js';
import { canAcceptProposal, validateAcceptForm, validateChangeRequest, PROPOSAL_AGREEMENT_VERSION, paragraphs } from '../../lib/engagementGate.js';
import { pickPlan, marketsFor, agreementDocument, isExpired, longDate, FIRST_PLAYBOOK_BUSINESS_DAYS } from '../../lib/proposalPlans.js';
import { SUMMARY_PARAGRAPH, WE_KNOW_CAM, EXPERTISE, outcomesFor, TOPICS, NEXT_STEPS, MARKET_COLORS } from '../../lib/proposalContent.js';
import { ThreadMessage } from '../ThreadMessage.jsx';
import AcceptCard from './AcceptCard.jsx';
import AgreementModal from './AgreementModal.jsx';
import TopicModal from './TopicModal.jsx';
import Investment from './Investment.jsx';
import { ArrowRight, External, Stripes } from './icons.jsx';

const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;
let viewedThisLoad = false;

// ============================================================================
// ProposalPage — the ONLY thing a new client sees until their owner accepts.
// Shell-less. Cover + floating acceptance card, six numbered sections, sidebar
// with proof/docs and the sticky question thread. Everything comes from
// DATA.engagement (engagement_proposals row → engagementRowToView) plus the
// evergreen content in src/lib/proposalContent.js. Staff see it through
// "View as client" (previewOnly): Accept is locked, everything else works.
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
  const locationNames = (Array.isArray(account.locations) ? account.locations : []).map((l) => (l && l.name) || l).filter(Boolean);
  const { named } = marketsFor(locationNames, selected);
  const outcomes = useMemo(() => outcomesFor(p.modules), [p.modules]);
  const sentDate = p.sentAt ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  useEffect(() => {
    if (viewedThisLoad || previewOnly) return;
    viewedThisLoad = true;
    track('proposal_viewed', { proposalId: p.id, version: p.version });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── floating card ↔ sidebar padding (README §1) ──────────────────────────
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
    effectiveDate: p.startDate, plan: selected, markets: named, signerName: name, signerTitle: title,
  }), [p.ref, p.clientLegalName, p.clientEntityType, p.clientAddress, p.startDate, selected, named.join('|'), name, title]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (previewOnly) { setErr('Staff preview — only the client’s owner can accept, from their own sign-in.'); return; }
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
    if (previewOnly) { setQErr('Staff preview — questions come from the client’s own sign-in.'); return; }
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

  const [topic, setTopic] = useState(null);
  const steps = NEXT_STEPS(preparerFirst, !!p.welcomeCallUrl);
  const introParas = paragraphs(p.intro);
  const closingParas = paragraphs(p.closing);

  return (
    <div className="pp" data-testid="proposal-page">
      {previewOnly ? <div role="button" className="pp-preview-bar" onClick={onExitPreview} title="Click to exit client view">👁 Viewing as a client — this is the locked proposal page. Click to exit</div> : null}
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
              {sentDate ? <><span className="dot" /><span className="eyebrow" style={{ color: '#a1c8e7' }}>{sentDate}</span></> : null}
            </div>
            <h1>{p.title || `Growth partnership for ${short}.`}</h1>
            {introParas.length ? introParas.map((t, i) => <p key={i}>{t}</p>) : <p>{SUMMARY_PARAGRAPH}</p>}
            {locationNames.length ? (
              <div className="pp-markets">
                <span className="eyebrow lbl">Your markets</span>
                {locationNames.slice(0, 5).map((n, i) => <span key={n} className="pp-chip-outline"><i style={{ background: MARKET_COLORS[i % MARKET_COLORS.length] }} />{n}</span>)}
              </div>
            ) : null}
          </div>
          <div className="pp-cover-spacer" />
          <AcceptCard
            cardRef={cardRef} plan={selected} company={company} startDate={p.startDate}
            roiDefaults={{ feePerDoor: p.roiFeePerDoor, doorsPerCommunity: p.roiDoorsPerCommunity }}
            canAccept={canAccept} ownerNames={owners} expired={expired} validThrough={p.validThrough} previewOnly={previewOnly}
            open={acceptOpen} onToggle={() => setAcceptOpen((o) => !o)} agreementRead={agreementRead} onOpenAgreement={openAgreement}
            name={name} title={title} onName={setName} onTitle={setTitle} onAccept={accept} busy={busy} err={err} nameRef={nameRef}
            accepted={!!accepted} acceptedAt={accepted && accepted.accepted_at} preparerFirst={preparerFirst} welcomeCallUrl={p.welcomeCallUrl} onEnterPortal={onAccepted}
          />
        </div>
      </div>

      {/* ── body ── */}
      <div className="pp-body">
        <div className="pp-main">
          <div className="pp-toc">
            <span className="eyebrow lbl">In this proposal</span>
            {[['s1', 'The plan'], ['s2', 'We know CAM'], ['s3', 'What you get'], ['s4', 'How we do it'], ['s5', 'Investment'], ['s6', 'Next steps']].map(([id, t], i) => (
              <a key={id} href={`#${id}`}><b>{String(i + 1).padStart(2, '0')}</b>{t}</a>
            ))}
          </div>

          <div id="s1" className="pp-h2"><span className="num">01</span><h2>The plan in one view</h2></div>
          <div className="card pp-pad">
            <p className="pp-lead">{SUMMARY_PARAGRAPH}</p>
            <div className="pp-tiles">
              <div className="pp-tile" style={{ borderTopColor: '#d9356e' }}><b>1</b><div className="t">Portal, one number</div><div className="d">Playbook, leads, reports and billing in one place.</div></div>
              <div className="pp-tile" style={{ borderTopColor: '#aed7d0' }}><b>{FIRST_PLAYBOOK_BUSINESS_DAYS}</b><div className="t">Business days to first playbook</div><div className="d">Counted from your welcome call.</div></div>
              <div className="pp-tile" style={{ borderTopColor: '#a1c8e7' }}><b>{selected ? selected.locations : locationNames.length || 1}</b><div className="t">Market{(selected ? selected.locations : 1) === 1 ? '' : 's'} covered</div><div className="d">Each one found, tracked and reviewed on its own.</div></div>
            </div>
          </div>

          <div id="s2" className="pp-h2"><span className="num">02</span><h2>We know CAM</h2></div>
          <div className="card pp-pad">
            <div className="pp-know">
              <p>{WE_KNOW_CAM.intro}</p>
              <div className="pp-years"><b>{WE_KNOW_CAM.years}</b><span>Combined years<br />in CAM</span></div>
            </div>
            <div className="pp-grid220">
              {EXPERTISE.map((x) => <div key={x.title} className="pp-xtile"><div className="pp-accent" style={{ background: x.color }} /><div className="t">{x.title}</div><div className="d">{x.body}</div></div>)}
            </div>
          </div>

          <div id="s3" className="pp-h2"><span className="num">03</span><h2>What you get</h2></div>
          <div className="pp-grid300" data-testid="pp-outcomes">
            {outcomes.map((o) => (
              <div key={o.tag} className="card pp-outcome">
                <div className="pp-accent" style={{ background: o.color }} />
                <div className="head"><span className="eyebrow tag">{o.tag}</span><span className="pp-pill">{o.scale}</span></div>
                <div className="t">{o.title}</div>
                <p>{o.body}</p>
                <div className="pp-chips">{o.chips.map((c) => <span key={c} className="pp-chip">{c}</span>)}</div>
              </div>
            ))}
          </div>

          <div id="s4" className="pp-h2"><span className="num">04</span><h2>How we do it</h2></div>
          <div className="pp-topics">
            {TOPICS.map((t) => (
              <button type="button" key={t.key} className="card pp-topic" onClick={() => setTopic(t)} data-testid={`pp-topic-${t.key}`}>
                <div className="pp-accent" style={{ background: t.color }} />
                <div className="head"><span className="eyebrow tag">{t.tag}</span><span className="scope" style={{ background: t.pillBg }}>{t.scope}</span></div>
                <div className="t">{t.title}</div>
                <div className="d">{t.blurb}</div>
                <div className="peek">Take a peek <ArrowRight size={14} /></div>
              </button>
            ))}
          </div>

          <div id="s5" className="pp-h2"><span className="num">05</span><h2>Investment &amp; guarantee</h2></div>
          <Investment p={p} plans={plans} selected={selected} onSelect={selectPlan} preparer={preparer} sentDate={sentDate} />

          <div id="s6" className="pp-h2"><span className="num">06</span><h2>Next steps</h2></div>
          <div className="pp-next">
            <Stripes thin />
            <h2>Say yes today.<br />Boards find you before the next quarter.</h2>
            {closingParas.length ? closingParas.map((t, i) => <p key={i}>{t}</p>) : <p>No kickoff paperwork, no waiting on a contract to bounce around. The moment you accept, the clock below starts.</p>}
            <div className="pp-timeline">
              <div className="track" />
              {steps.map((s) => (
                <div key={s.n} className="pp-tstep">
                  <div className="dot" style={{ background: s.color }}>{s.n}</div>
                  <div className="eyebrow when" style={{ color: s.color }}>{s.when}</div>
                  <div className="t">{s.title}</div>
                  <div className="d">{s.body}</div>
                </div>
              ))}
            </div>
            <div className="pp-next-foot">
              <div className="q">Questions first? {preparerFirst} answers in the thread on the right.</div>
              {!accepted && !expired && (canAccept || previewOnly) ? <button type="button" className="btn-pill" onClick={jumpToAccept} data-testid="pp-cta">Accept the proposal <ArrowRight /></button> : null}
            </div>
          </div>
        </div>

        {/* ── sidebar ── */}
        <div className="pp-side" style={{ paddingTop: sidebarPad }}>
          {(p.testimonialVimeoId || (p.referenceLinks || []).length) ? (
            <div className="card" data-testid="pp-proof">
              <div className="eyebrow k">Proof &amp; reference</div>
              <div className="t">Proof behind this proposal</div>
              {p.testimonialVimeoId ? (
                <div className="pp-video">
                  <div className="frame"><iframe src={`https://player.vimeo.com/video/${p.testimonialVimeoId}?title=0&byline=0&portrait=0&color=d9356e`} title="Client testimonial" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" /></div>
                  <div className="cap"><i />{p.testimonialCaption || 'Client testimonial'}</div>
                </div>
              ) : null}
              {(p.referenceLinks || []).length ? (
                <div className="pp-docs">
                  {p.referenceLinks.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (!previewOnly) track('proposal_ref_open', { url: l.url }); }}>{l.label}<External /></a>)}
                </div>
              ) : null}
            </div>
          ) : null}

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
      <Stripes className="pp-foot-stripes" />

      {topic ? <TopicModal topic={topic} markets={named} onClose={() => setTopic(null)} /> : null}
      {agreementOpen ? <AgreementModal doc={agreement} onClose={() => setAgreementOpen(false)} onAgree={agree} canAgree={!expired} /> : null}
    </div>
  );
}
