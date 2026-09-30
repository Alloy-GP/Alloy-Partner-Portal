import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { track } from '../lib/track.js';
import { acceptProposal, requestProposalChanges } from '../lib/engagement.js';
import {
  canAcceptProposal, validateAcceptForm, validateChangeRequest, proposalAgreementText,
  PROPOSAL_AGREEMENT_VERSION, fmtMoney, fmtDate, fmtWhen, paragraphs,
} from '../lib/engagementGate.js';
import {
  groupByEngine, deliverableLines, locationImpact, effortByEngine, effortCurve, scalesWithLocations,
} from '../lib/engagementCatalog.js';

const { useState, useEffect, useMemo, useRef } = React;

// ============================================================================
// ProposalGate — the ONLY thing a new client can see until their owner accepts
// Alloy's engagement proposal. Shell-less (no sidebar, no nav): the document,
// an Accept card (owner only), a "ask a question" card, reference docs, and a
// placeholder for the case studies + learning that will live here later.
//
// Everything rendered comes from DATA.engagement (engagement_proposals row →
// engagementRowToView) + the evergreen catalog. Staff see this page through
// "View as client" with previewOnly — Accept is disabled there on purpose: the
// commitment has to come from the client's own sign-in (the edge fn enforces it).
// ============================================================================

let viewedThisLoad = false;

const Ext = () => <I.External width={13} height={13} />;

export default function ProposalGate({ onAccepted, onSignOut, previewOnly = false, onExitPreview }) {
  const p = DATA.engagement || {};
  const account = DATA.account || {};
  const user = DATA.user || {};
  const company = account.company || account.shortName || 'your company';
  const title = p.title || `Growth partnership for ${company}`;
  const canAccept = !previewOnly && canAcceptProposal(user);
  const owners = (DATA.team || []).filter((t) => !t.isStaff && t.role === 'owner').map((t) => t.name).filter(Boolean);

  const groups = useMemo(() => groupByEngine(p.modules), [p.modules]);
  const impact = useMemo(() => locationImpact(p.modules, p.locationsCount), [p.modules, p.locationsCount]);
  const byEngine = useMemo(() => effortByEngine(p.modules, p.locationsCount), [p.modules, p.locationsCount]);
  const byEngineOne = useMemo(() => Object.fromEntries(effortByEngine(p.modules, 1).map((x) => [x.engine.key, x.effort])), [p.modules]);
  const curve = useMemo(() => effortCurve(p.modules, Math.max(4, (p.locationsCount || 1) + 1)), [p.modules, p.locationsCount]);
  const curveMax = Math.max(1, ...curve.map((c) => c.effort));
  const maxEngine = Math.max(1, ...byEngine.map((x) => x.effort));
  const locationNames = Array.isArray(account.locations) ? account.locations.map((l) => (l && l.name) || l).filter(Boolean) : [];

  useEffect(() => {
    if (viewedThisLoad || previewOnly) return;
    viewedThisLoad = true;
    track('proposal_viewed', { proposalId: p.id, version: p.version });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── accept ────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({ name: user.name || '', title: user.title || '', agree: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };
  const accept = async () => {
    if (previewOnly) { setErr('Staff preview — only the client’s owner can accept, from their own sign-in.'); return; }
    const v = validateAcceptForm(form);
    setErrors(v.errors);
    if (!v.ok) { setErr('Check the highlighted fields.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await acceptProposal({ proposalId: p.id, name: form.name.trim(), title: form.title.trim(), agreementVersion: PROPOSAL_AGREEMENT_VERSION });
      track('proposal_accepted', { proposalId: p.id, version: p.version });
      setDone(r.proposal || { accepted_at: new Date().toISOString() });
    } catch (e) {
      setErr(String((e && e.message) || e || 'Something went wrong. Please try again.'));
    } finally { setBusy(false); }
  };

  // ── the conversation (client questions + staff replies) ──────────────────
  // Seeded from DATA and re-synced when a realtime refresh brings a staff reply.
  const [thread, setThread] = useState(p.thread || []);
  useEffect(() => { setThread(p.thread || []); }, [p.thread]);
  const threadRef = useRef(null);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread.length]);
  const [q, setQ] = useState('');
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState('');
  const [qSent, setQSent] = useState(false);
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

  if (done) {
    return (
      <div className="eg-page" data-testid="proposal-accepted">
        <TopBar company={company} user={user} onSignOut={onSignOut} previewOnly={previewOnly} onExitPreview={onExitPreview} />
        <div className="eg-body eg-body-center">
          <div className="card eg-card eg-done">
            <div className="eg-done-icon"><I.Check width={26} height={26} /></div>
            <div className="eg-kicker">Proposal accepted</div>
            <h1 className="eg-h1">Welcome aboard, {company}.</h1>
            <p className="eg-p">Your Growth Portal is open. First stop: add a bank account so autopay is ready before your first month, then your Alloy team kicks off the Foundation phase you just read about.</p>
            <button className="btn btn-primary" onClick={onAccepted} data-testid="enter-portal">Enter your portal</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="eg-page" data-testid="proposal-gate">
      <TopBar company={company} user={user} onSignOut={onSignOut} previewOnly={previewOnly} onExitPreview={onExitPreview} />

      <div className="eg-body">
        <main className="eg-doc">
          {/* ── Hero ── */}
          <section className="card eg-card eg-hero">
            <div className="eg-kicker">Proposal · v{p.version || 1}{p.sentAt ? ` · ${fmtDate(p.sentAt)}` : ''}</div>
            <h1 className="eg-h1">{title}</h1>
            <div className="eg-prepared">Prepared for <strong>{company}</strong> by Alloy Growth Partners</div>
            {paragraphs(p.intro).map((para, i) => <p key={i} className="eg-p">{para}</p>)}
          </section>

          {/* ── Markets & effort ── */}
          <section className="card eg-card" data-testid="eg-markets">
            <div className="card-head"><span className="kicker">Your markets</span><h3>Built for {impact.locations} {impact.locations === 1 ? 'location' : 'locations'}</h3></div>
            <div className="eg-markets">
              <div className="eg-bignum"><span className="n">{impact.locations}</span><span className="l">{impact.locations === 1 ? 'location' : 'locations'}</span></div>
              <div className="eg-markets-text">
                {locationNames.length ? <div className="eg-locnames">{locationNames.map((n, i) => <span key={i} className="eg-chip">{n}</span>)}</div> : null}
                <p className="eg-p">
                  {impact.locations === 1
                    ? 'Every module below is scoped to a single market. When you add a location, the per-market work (profiles, pages, tracking, reviews) grows with it.'
                    : <>At {impact.locations} locations this plan is <strong>{impact.multiplier}× the effort</strong> of a single-market engagement. Every market gets its own Google profile, location page, tracking number, and review flow — that is where the extra effort goes, and it is why multi-market growth compounds.</>}
                </p>
              </div>
            </div>

            {byEngine.length ? (
              <div className="eg-effort">
                <div className="eg-effort-head"><span>Relative effort by engine</span><span className="eg-muted">at {impact.locations} vs. 1 location</span></div>
                {byEngine.map((x) => {
                  const one = byEngineOne[x.engine.key] || 0;
                  return (
                    <div key={x.engine.key} className="eg-bar-row">
                      <span className="eg-bar-lbl"><i style={{ background: x.engine.color }} />{x.engine.name}</span>
                      <span className="eg-bar">
                        <i className="now" style={{ width: `${Math.round((x.effort / maxEngine) * 100)}%`, background: x.engine.color }} />
                        {impact.locations > 1 ? <i className="one" style={{ width: `${Math.round((one / maxEngine) * 100)}%` }} /> : null}
                      </span>
                      <span className="eg-bar-val">{x.effort}{impact.locations > 1 && one !== x.effort ? <span className="eg-muted"> · {one} at 1</span> : null}</span>
                    </div>
                  );
                })}
                <div className="eg-curve">
                  {curve.map((c) => (
                    <div key={c.locations} className={`eg-curve-col${c.locations === impact.locations ? ' is-now' : ''}`} title={`${c.locations} location${c.locations === 1 ? '' : 's'} · effort ${c.effort}`}>
                      <i style={{ height: `${Math.round(6 + (c.effort / curveMax) * 50)}px` }} />
                      <span>{c.locations}</span>
                    </div>
                  ))}
                  <div className="eg-curve-cap">Effort as locations grow. Relative units, not hours.</div>
                </div>
              </div>
            ) : null}
          </section>

          {/* ── Scope by engine ── */}
          {groups.map((g) => (
            <section key={g.engine.key} className="eg-engine" data-testid={`eg-engine-${g.engine.key}`}>
              <div className="eg-engine-head">
                <span className="eg-engine-dot" style={{ background: g.engine.color }} />
                <div>
                  <div className="eg-engine-name">{g.engine.name}</div>
                  <div className="eg-engine-tag">{g.engine.tagline}</div>
                </div>
              </div>
              <div className="eg-mods">
                {g.modules.map((m) => (
                  <div key={m.key} className="card eg-card eg-mod">
                    <div className="eg-mod-head">
                      <div className="eg-mod-name">{m.name}</div>
                      {scalesWithLocations(m) && impact.locations > 1 ? <span className="eg-scale-tag">scales with your {impact.locations} locations</span> : null}
                    </div>
                    <p className="eg-p eg-mod-sum">{m.summary}</p>
                    <ul className="eg-lines">
                      {deliverableLines(m, impact.locations).map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                    <div className="eg-includes">{m.includes.map((s, i) => <span key={i} className="eg-chip eg-chip-soft">{s}</span>)}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* ── Investment ── */}
          <section className="card eg-card" data-testid="eg-investment">
            <div className="card-head"><span className="kicker">Investment</span><h3>What it costs, and when it starts</h3></div>
            {p.monthlyAmount ? (
              <div className="eg-invest">
                <div className="eg-invest-main"><span className="n">{fmtMoney(p.monthlyAmount)}</span><span className="l">per month</span></div>
                <dl className="eg-dl">
                  {p.setupAmount ? <><dt>One-time setup</dt><dd>{fmtMoney(p.setupAmount)}</dd></> : null}
                  {p.startDate ? <><dt>Start</dt><dd>{fmtDate(p.startDate)}</dd></> : null}
                  {p.termMonths ? <><dt>Term</dt><dd>{p.termMonths} months</dd></> : null}
                  <dt>Billing</dt><dd>Monthly by ACH autopay — you add a bank account right after accepting.</dd>
                </dl>
              </div>
            ) : (
              <p className="eg-p">Investment to be confirmed with your strategist before you accept. Ask below if it is not on this page yet.</p>
            )}
          </section>

          {/* ── Closing ── */}
          <section className="card eg-card">
            <div className="card-head"><span className="kicker">Next</span><h3>What happens when you accept</h3></div>
            {paragraphs(p.closing).map((para, i) => <p key={i} className="eg-p">{para}</p>)}
            <ol className="eg-steps">
              <li><strong>Your portal opens.</strong> Playbook, roadmap, leads and your Alloy inbox, live from day one.</li>
              <li><strong>Autopay setup.</strong> Add a bank account once; Alloy confirms the monthly draft with you before anything moves.</li>
              <li><strong>Foundation kicks off.</strong> Master brief, keyword research, growth audit, content map, sitemap, first playbook — tracked on your roadmap.</li>
            </ol>
          </section>
        </main>

        <aside className="eg-aside">
          {/* ── Accept ── */}
          <section className="card eg-card eg-accept" data-testid="eg-accept">
            <div className="eg-kicker">Ready?</div>
            <h3 className="eg-h3">Accept this proposal</h3>
            {previewOnly ? (
              <div className="eg-note eg-note-warn"><strong>Staff preview.</strong> This is what the client’s owner sees. Only they can accept, from their own sign-in.</div>
            ) : null}
            {canAccept || previewOnly ? (
              <>
                <label className="nr-field">
                  <span className="nr-label">Your full name</span>
                  <input className={`input${errors.name ? ' is-invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" placeholder="First and last" />
                  {errors.name ? <span className="pm-field-err" role="alert">{errors.name}</span> : null}
                </label>
                <label className="nr-field">
                  <span className="nr-label">Title <span className="eg-muted">(optional)</span></span>
                  <input className="input" value={form.title} onChange={set('title')} autoComplete="organization-title" placeholder="e.g. CEO" />
                </label>
                <label className={`pm-agree${errors.agree ? ' is-invalid' : ''}`}>
                  <input type="checkbox" checked={form.agree} onChange={set('agree')} />
                  <span>
                    {proposalAgreementText(company, p)}
                    <span style={{ display: 'block', marginTop: 4, color: 'var(--fg-muted)' }}>Agreement {PROPOSAL_AGREEMENT_VERSION} · proposal v{p.version || 1}</span>
                  </span>
                </label>
                {errors.agree ? <div className="pm-field-err" role="alert">{errors.agree}</div> : null}
                {err ? <div className="nr-err" role="alert">{err}</div> : null}
                <button className="btn btn-primary eg-accept-btn" onClick={accept} disabled={busy || previewOnly} title={previewOnly ? 'Preview only' : undefined} data-testid="eg-accept-btn">
                  {busy ? 'Accepting…' : 'Accept proposal'}
                </button>
              </>
            ) : (
              <div className="eg-note">
                Your account owner{owners.length ? ` (${owners.join(', ')})` : ''} accepts on behalf of {company}. You can read everything here and send questions below.
              </div>
            )}
          </section>

          {/* ── Conversation ── */}
          <section className="card eg-card" data-testid="eg-questions">
            <div className="eg-kicker">Questions &amp; changes</div>
            <h3 className="eg-h3">Talk to your Alloy team</h3>
            {thread.length ? (
              <div className="eg-thread" ref={threadRef} data-testid="eg-thread" aria-live="polite">
                {thread.map((m, i) => <ThreadMessage key={i} m={m} mine={m.role !== 'staff'} />)}
              </div>
            ) : (
              <div className="eg-note">Ask anything about this proposal: a change, a date, something unclear. Replies show up right here, and by email.</div>
            )}
            {qSent ? <div className="eg-note eg-note-ok"><strong>Sent.</strong> Your Alloy team has it.</div> : null}
            <textarea className="input" rows={3} value={q} onChange={(e) => { setQ(e.target.value); setQErr(''); setQSent(false); }} placeholder={thread.length ? 'Reply…' : 'A change you’d like, something unclear, a different start date…'} />
            {qErr ? <div className="nr-err" role="alert">{qErr}</div> : null}
            <button className="btn btn-secondary" onClick={ask} disabled={qBusy || previewOnly} title={previewOnly ? 'Preview only' : undefined}>{qBusy ? 'Sending…' : 'Send'}</button>
          </section>

          {/* ── Reference docs ── */}
          {(p.referenceLinks || []).length ? (
            <section className="card eg-card" data-testid="eg-refs">
              <div className="eg-kicker">Reference</div>
              <h3 className="eg-h3">Documents behind this proposal</h3>
              <ul className="eg-refs">
                {p.referenceLinks.map((l, i) => (
                  <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (!previewOnly) track('proposal_ref_open', { url: l.url }); }}>{l.label}<Ext /></a></li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Coming soon ── */}
          <section className="card eg-card eg-soon">
            <div className="eg-kicker">Coming soon</div>
            <h3 className="eg-h3">Case studies &amp; learning</h3>
            <p className="eg-p eg-muted">How other CAM firms grew with Alloy, and short courses your team can start before day one — right here, while you decide.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

// One message in the proposal thread. Colour says WHO (Alloy = purple, client =
// light); side says whose screen it is (`mine` sits right). Shared with Admin.
export function ThreadMessage({ m, mine }) {
  const who = m.role === 'staff' ? `${m.name || 'Alloy'} · Alloy` : (m.name || 'Client');
  return (
    <div className={`eg-msg ${m.role === 'staff' ? 'is-staff' : 'is-client'}${mine ? ' is-mine' : ''}`} data-role={m.role}>
      <div className="eg-msg-meta">{who}{m.at && fmtWhen(m.at) ? ` · ${fmtWhen(m.at)}` : ''}</div>
      <div className="eg-msg-body">{m.message}</div>
    </div>
  );
}

function TopBar({ company, user, onSignOut, previewOnly, onExitPreview }) {
  return (
    <>
      {previewOnly ? (
        <div role="button" onClick={onExitPreview} className="eg-preview-bar" title="Click to exit client view">
          👁 Viewing as a client — this is the locked proposal page. Click to exit
        </div>
      ) : null}
      <header className="eg-top">
        <div className="eg-top-brand">
          <img src="/assets/alloy-logo-full-color.svg" alt="Alloy Growth Partners" />
          <span className="eg-top-sep" />
          <span className="eg-top-for">Proposal for <strong>{company}</strong></span>
        </div>
        <div className="eg-top-user">
          {user.name || user.email ? <span className="eg-muted">{user.name || user.email}</span> : null}
          {onSignOut ? <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button> : null}
        </div>
      </header>
    </>
  );
}
