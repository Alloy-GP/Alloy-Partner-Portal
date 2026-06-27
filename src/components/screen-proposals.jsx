import React from 'react';
import { I } from './icons.jsx';
import { getLeads, UVP_TITLES, UVP_BLURBS, pricing, freshWatch, CAM_COMPANY } from '../lib/proposalMockData.js';
import { MatchRing, MatchingEngine } from './proposal-shared.jsx';
import UVPLibrary from './screen-uvp-library.jsx';
import { DATA } from '../data.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

// ============================================================================
// Proposals — CAM staff cockpit, v15 (Review → Build → Send → Close · Retain).
//
// All five surfaces built on mock data: Review (match analysis + engine modal),
// Build (section checklist + LIVE board-doc preview + "Open full proposal"),
// Send (email mockup + launch → Sent), Close (post-send engagement analytics),
// Retain (handoff to the Retention module). Renders inside the portal shell.
//
// Match is computed live by the engine / LLM. "Watch" is "Close" user-facing.
// Styles: 15-proposals.css (scoped under .proposal-system).
// ============================================================================

const { useState, useRef, useLayoutEffect, useEffect } = React;
// The board link uses the unguessable board_token (the real magic-link secret)
// when present; falls back to the lead id only in mock dev (no token). The board
// page resolves the token anonymously via the proposal-board edge fn.
const BOARD_URL = (sub) => `/proposals/board/${(sub && sub.boardToken) || (sub && sub.id) || sub}`;

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmtMoney = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DISQ_REASONS = ['Budget below our floor', 'Outside service area', 'Renewed with current manager', 'Self-managing for now', 'Other'];

const stageOf = (s) => {
  if (s.disq) return 'closed';
  if (s.status === 'new') return 'pending';
  if (s.status === 'accepted' || s.status === 'declined') return 'closed';
  return 'qualified';
};

const OWNER_COLORS = { AB: 'linear-gradient(135deg,#d9356e,#a82451)', JR: 'linear-gradient(135deg,#4b86b4,#2a6391)' };
function OwnerAvatar({ initials, size }) {
  const s = size || 26;
  return <span className="ps-sub-av" style={{ width: s, height: s, background: OWNER_COLORS[initials] || 'linear-gradient(135deg,#8a8395,#5d5468)' }}>{initials}</span>;
}

function QPill({ s }) {
  let cls = 'review', label = 'Qualified';
  if (s.disq) { cls = 'declined'; label = 'Not quotable'; }
  else if (s.status === 'new') { cls = 'new'; label = 'Pending'; }
  else if (s.status === 'accepted') { cls = 'accepted'; label = 'Won'; }
  else if (s.status === 'declined') { cls = 'declined'; label = 'Lost'; }
  else if (s.status === 'sent') { cls = 'sent'; label = 'Sent'; }
  else if (s.status === 'draft') { cls = 'review'; label = 'Drafting'; }
  return <span className={'ps-pill ps-pill--' + cls}><span className="d" />{label}</span>;
}

const MATCH_SEGS = 7;
function MatchConcern({ concern, uvps, blurbs, index }) {
  const [open, setOpen] = useState(false);
  const strong = concern.fit >= 85;
  const lit = Math.round(concern.fit / 100 * MATCH_SEGS);
  const nCaps = concern.caps.length;
  return (
    <div className={'v2-match' + (open ? ' open' : '')}>
      <div className="v2-match-row" onClick={() => setOpen(!open)}>
        <span className="v2-match-ic">{index}</span>
        <span className="v2-match-name">{concern.label}</span>
        <span className={'v2-seg-chev' + (open ? ' open' : '')}><I.Chevron width={16} height={16} /></span>
      </div>
      <div className="v2-seg-wrap" onClick={() => setOpen(!open)}>
        <div className="v2-segs">
          {Array.from({ length: MATCH_SEGS }).map((_, i) => (
            <span key={i} className={'v2-seg' + (i < lit ? (strong ? ' on-strong' : ' on-partial') : '')} style={{ transitionDelay: (i * 45) + 'ms' }} />
          ))}
        </div>
        <span className="v2-seg-val">{concern.fit}%</span>
      </div>
      <div className={'v2-seg-cap ' + (strong ? 'strong' : 'partial')}>
        <span className="dot" /><b>{strong ? 'Strong match' : 'Partial match'}</b> · {`${nCaps} ${nCaps === 1 ? 'strength' : 'strengths'} answer this`}
      </div>
      {open && (
        <div className="v2-match-detail">
          {concern.caps.map((ci, k) => (
            <div className="v2-cap" key={k}>
              <span className="v2-cap-ic"><I.Bolt width={14} height={14} /></span>
              <div><div className="v2-cap-name">{uvps[ci]}{k === 0 && <span className="v2-cap-fit">top fit</span>}</div><div className="v2-cap-blurb">{blurbs[ci]}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QualifyModal({ s, onClose, onQualify, onDisqualify }) {
  const [tab, setTab] = useState('qualify');
  const [owner, setOwner] = useState(s.owner || 'AB');
  const [val, setVal] = useState(s.quoteValue);
  const [reason, setReason] = useState(DISQ_REASONS[0]);
  return (
    <div className="ps-scrim" onClick={onClose}>
      <div className="ps-modal v2-qual-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal-head">
          <span className="t">Qualify · {s.community}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>{s.homes} homes · {s.city}</span>
          <button className="x" onClick={onClose}><I.Close width={15} height={15} /></button>
        </div>
        <div className="v2-qual-tabs">
          <button data-on={tab === 'qualify'} onClick={() => setTab('qualify')}>Move to qualified</button>
          <button data-on={tab === 'disq'} onClick={() => setTab('disq')}>Not quotable</button>
        </div>
        {tab === 'qualify' ? (
          <div className="v2-qual-body">
            <label className="v2-qual-label">Sales owner</label>
            <div className="v2-qual-owners">
              {['AB', 'JR'].map((o) => (
                <button key={o} className="v2-qual-owner" data-on={owner === o} onClick={() => setOwner(o)}>
                  <OwnerAvatar initials={o} size={24} /><span>{o === 'AB' ? 'Amanda B.' : 'Jordan R.'}</span>
                  {owner === o && <span className="v2-qual-tick"><I.Check width={12} height={12} /></span>}
                </button>
              ))}
            </div>
            <label className="v2-qual-label">Estimated quote value <span>· annual contract</span></label>
            <div className="v2-qual-money"><span>$</span><input type="number" min="0" step="100" value={val} onChange={(e) => setVal(parseFloat(e.target.value) || 0)} /><span className="u">/yr</span></div>
            <div className="v2-qual-hint">Auto-filled from the recommended tier ({s.tierName} · {money(s.perHome * s.homes)}/mo). Adjust if you've agreed otherwise.</div>
            <div className="v2-qual-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { onQualify(s.id, owner, val); onClose(); }}><I.Check width={14} height={14} /> Qualify lead</button>
            </div>
          </div>
        ) : (
          <div className="v2-qual-body">
            <div className="v2-qual-warn">This lead won't get a proposal. It moves to <b>Closed</b> as not quotable — you can re-qualify it later.</div>
            <label className="v2-qual-label">Reason</label>
            <div className="v2-qual-reasons">
              {DISQ_REASONS.map((r) => (
                <button key={r} className="v2-qual-reason" data-on={reason === r} onClick={() => setReason(r)}><span className="v2-qual-radio" data-on={reason === r} />{r}</button>
              ))}
            </div>
            <div className="v2-qual-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn v2-btn-danger" onClick={() => { onDisqualify(s.id, reason); onClose(); }}>Mark not quotable</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WinModal({ s, onClose, onWin, onLose }) {
  const [val, setVal] = useState(s.salesValue != null ? s.salesValue : s.quoteValue);
  return (
    <div className="ps-scrim" onClick={onClose}>
      <div className="ps-modal v2-qual-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal-head">
          <span className="t">Close deal · {s.community}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>{s.homes} homes · quoted {money(s.quoteValue)}/yr</span>
          <button className="x" onClick={onClose}><I.Close width={15} height={15} /></button>
        </div>
        <div className="v2-qual-body">
          <label className="v2-qual-label">Signed sales value <span>· annual contract</span></label>
          <div className="v2-qual-money"><span>$</span><input type="number" min="0" step="100" value={val} onChange={(e) => setVal(parseFloat(e.target.value) || 0)} /><span className="u">/yr</span></div>
          <div className="v2-qual-hint">Prefilled from the quote ({money(s.quoteValue)}/yr). Adjust to what the board actually signed.</div>
          <div className="v2-qual-actions v2-qual-actions--split">
            <button className="btn v2-btn-danger" onClick={() => { onLose(s.id); onClose(); }}>Lost the deal</button>
            <button className="btn v2-btn-win" onClick={() => { onWin(s.id, val); onClose(); }}><I.Check width={14} height={14} /> Mark won</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueCard({ s, selected, onSelect, onBuild, onQualify, onWin }) {
  const stage = stageOf(s);
  const won = s.status === 'accepted', lost = s.status === 'declined';
  const showValue = stage === 'qualified' || won;
  return (
    <div className="v2-q" data-active={selected} data-stage={stage} onClick={() => onSelect(s.id)} role="button" tabIndex={0}>
      <div className="v2-q-top"><span className="v2-q-name">{s.community}</span><QPill s={s} /></div>
      <div className="v2-q-meta">{s.city} · {s.homes} homes</div>
      {stage !== 'pending' && (
        <div className="v2-q-pipe">
          {!s.disq && <span className="v2-q-owner"><OwnerAvatar initials={s.owner} size={20} /></span>}
          {showValue && <span className="v2-q-val">{money(won ? (s.salesValue || s.quoteValue) : s.quoteValue)}<span className="u">/yr{won ? '' : ' est.'}</span></span>}
          {won && s.salesValue != null && s.salesValue !== s.quoteValue && <span className="v2-q-quoted">quoted {money(s.quoteValue)}</span>}
          {won && <span className="v2-q-tag won">Closed-won</span>}
          {lost && <span className="v2-q-tag lost">Closed-lost</span>}
          {s.disq && <span className="v2-q-tag lost">{s.disqReason || 'Not quotable'}</span>}
        </div>
      )}
      <div className="v2-q-id">{s.id}</div>
      {selected && stage === 'pending' && (
        <div className="v2-q-acts"><button className="v2-q-build" onClick={(e) => { e.stopPropagation(); onQualify(s); }}>Qualify lead <I.Arrow width={13} height={13} /></button></div>
      )}
      {selected && stage === 'qualified' && s.status !== 'sent' && (
        <button className="v2-q-build" onClick={(e) => { e.stopPropagation(); onBuild(); }}>Build proposal <I.Arrow width={13} height={13} /></button>
      )}
      {selected && stage === 'qualified' && s.status === 'sent' && (
        <div className="v2-q-close">
          <div className="v2-q-note"><I.Send width={12} height={12} /> Sent · awaiting the board</div>
          <button className="v2-q-build v2-q-build--green" onClick={(e) => { e.stopPropagation(); onWin(s); }}>Mark as won</button>
        </div>
      )}
      {selected && won && s.salesValue == null && (
        <button className="v2-q-build v2-q-build--green" onClick={(e) => { e.stopPropagation(); onWin(s); }}>Add sales value</button>
      )}
    </div>
  );
}

function Queue({ subs, selectedId, onSelect, onBuild, onQualify, onWin }) {
  const [tab, setTab] = useState('pending');
  const buckets = { pending: [], qualified: [], closed: [] };
  subs.forEach((s) => buckets[stageOf(s)].push(s));
  const SECTIONS = [{ id: 'pending', label: 'Pending' }, { id: 'qualified', label: 'Qualified' }, { id: 'closed', label: 'Closed' }];
  return (
    <div className="v2-queue">
      <div className="v2-queue-head"><div className="v2-queue-label">Leads</div></div>
      <div className="v2-q-tabbar">
        {SECTIONS.map((sec) => (
          <button key={sec.id} className="v2-q-tab" data-on={tab === sec.id} onClick={() => setTab(sec.id)}>{sec.label}<span className="c">{buckets[sec.id].length}</span></button>
        ))}
      </div>
      <div className="v2-q-list">
        {buckets[tab].length
          ? buckets[tab].map((s) => <QueueCard key={s.id} s={s} selected={s.id === selectedId} onSelect={onSelect} onBuild={onBuild} onQualify={onQualify} onWin={onWin} />)
          : <div className="v2-q-empty">Nothing here yet.</div>}
      </div>
    </div>
  );
}

function ReviewScreen({ subs, selectedId, onSelect, onBuild, sub, onQualify, onDisqualify, onMarkWon, onMarkLost }) {
  const [qualifyTarget, setQualifyTarget] = useState(null);
  const [winTarget, setWinTarget] = useState(null);
  const [showEngine, setShowEngine] = useState(false);
  const pr = pricing(sub);
  const matched = sub.scores.filter((x) => x > 0).length;
  const links = sub.links.reduce((a, l) => a + l.length, 0);
  return (
    <div className="v2-review">
      <Queue subs={subs} selectedId={selectedId} onSelect={onSelect} onBuild={onBuild} onQualify={(s) => setQualifyTarget(s)} onWin={(s) => setWinTarget(s)} />
      {qualifyTarget && <QualifyModal s={qualifyTarget} onClose={() => setQualifyTarget(null)} onQualify={onQualify} onDisqualify={onDisqualify} />}
      {winTarget && <WinModal s={winTarget} onClose={() => setWinTarget(null)} onWin={onMarkWon} onLose={onMarkLost} />}

      {showEngine && (
        <div className="ps-scrim" onClick={() => setShowEngine(false)}>
          <div className="v2-engine-modal" onClick={(e) => e.stopPropagation()}>
            <div className="v2-engine-modal-head">
              <div className="ps-engine-head">
                <span className="ps-engine-eyebrow">Matching engine</span>
                <span className="ps-engine-live"><span className="d" />LIVE</span>
                <span className="ps-engine-stats"><b>{sub.concerns.length}</b> concerns · <b>{matched}</b> matched · <b>{links}</b> links</span>
              </div>
              <button className="v2-engine-modal-x" onClick={() => setShowEngine(false)} aria-label="Close"><I.Close width={16} height={16} /></button>
            </div>
            <div className="v2-engine-modal-body">
              <div className="ps-graph-cols"><span className="ps-graph-col l">{sub.community} pain points</span><span className="ps-graph-col r">{CAM_COMPANY.shortName} UVPs</span></div>
              <MatchingEngine concerns={sub.concerns} uvps={UVP_TITLES} links={sub.links} />
            </div>
          </div>
        </div>
      )}

      <div className="v2-analysis">
        <div className="v2-an-head">
          <div style={{ minWidth: 0 }}>
            <div className="v2-an-eyebrow">Pain points → {CAM_COMPANY.shortName} strengths</div>
            <h2 className="v2-an-title">{sub.community}</h2>
            <div className="v2-an-sub">{sub.tagline}</div>
            <span className="v2-intake-tag"><I.Mail width={11} height={11} /> From board intake form</span>
            <span className="v2-intake-tag" style={{ marginLeft: 6, background: sub._source === 'llm' ? 'var(--alloy-pink-tint)' : '#f0ecf6', color: sub._source === 'llm' ? '#a82451' : '#7a6f88' }}>
              {sub._source === 'llm' ? <><I.Sparkle width={11} height={11} /> AI-matched</> : 'Tag-matched'}
            </span>
          </div>
          <div className="v2-an-ring"><MatchRing value={sub.match} size={150} label="Strong fit" caps={sub.capsMatched} capsTotal={sub.capsTotal} dark /></div>
        </div>

        <div>
          <div className="v2-match-head">
            <div className="v2-match-head-text">
              <h3 className="v2-match-h">Every pain point {sub.community} raised — and how {CAM_COMPANY.shortName} answers it</h3>
              <div className="v2-match-meta"><b>{sub.concerns.length}</b> concerns&nbsp;·&nbsp;<b>{matched}</b> capabilities matched&nbsp;·&nbsp;<b>{links}</b> connections</div>
            </div>
            <button className="v2-engine-btn" onClick={() => setShowEngine(true)}>
              <span className="v2-eng-pulse" aria-hidden="true"><span className="ring" /><span className="ring r2" /><span className="dot" /></span>
              Open Engine Map
            </button>
          </div>
          <div className="v2-match-list">
            {sub.concerns.map((c, i) => <MatchConcern key={sub.id + i} concern={c} uvps={UVP_TITLES} blurbs={UVP_BLURBS} index={i + 1} />)}
          </div>
        </div>
      </div>

      <div className="v2-ctx">
        <div className="v2-card">
          <div className="v2-ctx-name">{sub.community}</div>
          <div className="v2-ctx-id">{sub.id}</div>
          <div className="v2-ctx-rows">
            <div className="v2-ctx-row"><span className="v2-ctx-k">Contact</span><span className="v2-ctx-v">{sub.contact} · {sub.contactRole}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Email</span><span className="v2-ctx-v">{sub.email}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Phone</span><span className="v2-ctx-v">{sub.phone}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Type</span><span className="v2-ctx-v">{sub.metaType}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Homes</span><span className="v2-ctx-v">{sub.homes}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Status</span><span className="v2-ctx-v">{sub.metaStatus}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Dues</span><span className="v2-ctx-v">{sub.dues}</span></div>
            <div className="v2-ctx-row"><span className="v2-ctx-k">Timeline</span><span className="v2-ctx-v">{sub.engageTimeline}</span></div>
            <div className="v2-ctx-row full"><span className="v2-ctx-k">Budget</span><span className="v2-ctx-v">{sub.budget}</span></div>
          </div>
          <div className="v2-ctx-quote"><div className="v2-ctx-quote-k">In their words</div><div className="v2-quote">"{sub.quote}"</div></div>
        </div>
        <div className="v2-card">
          <div className="v2-tier-eyebrow">Recommended tier</div>
          <div className="v2-tier-name">{sub.tierName}</div>
          <div className="v2-tier-price">{pr.monthly}<small> /mo</small></div>
          <div className="v2-tier-breakdown">
            <div className="v2-tier-brow"><span className="v2-tier-bk">Per home</span><span className="v2-tier-bv">{pr.perHome}</span></div>
            <div className="v2-tier-brow"><span className="v2-tier-bk">Homes</span><span className="v2-tier-bv">{sub.homes}</span></div>
            <div className="v2-tier-brow"><span className="v2-tier-bk">Billed annually</span><span className="v2-tier-bv">{pr.annual}</span></div>
          </div>
          <div className="v2-tier-foot">No setup fee</div>
        </div>
      </div>
    </div>
  );
}

// ============================ BUILD ============================
function LeadCard({ sub, perHome, setPerHome }) {
  const [edit, setEdit] = useState(false);
  const monthly = (perHome || 0) * sub.homes;
  return (
    <div className="v2-lead">
      <div className="v2-lead-top"><div className="v2-lead-name">{sub.community}</div><span className="v2-lead-match">{sub.match}%</span></div>
      <div className="v2-lead-meta">{sub.contact} · {sub.homes} homes · {sub.city}</div>
      <div className="v2-lead-price">
        <span className="v2-lead-tier">{sub.tierName}</span>
        {edit ? (
          <div className="v2-price-edit">
            <span>$</span>
            <input type="number" step="0.01" min="0" value={perHome} autoFocus onChange={(e) => setPerHome(parseFloat(e.target.value) || 0)} onBlur={() => setEdit(false)} onKeyDown={(e) => e.key === 'Enter' && setEdit(false)} />
            <span>/home → <b>{fmtMoney(monthly)}/mo</b></span>
          </div>
        ) : (
          <button className="v2-lead-moline" onClick={() => setEdit(true)}>
            {fmtMoney(monthly)}<span className="u">/mo</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ClSection({ s, toggle, onEdit }) {
  return (
    <div className="v2-cl">
      <div className="v2-cl-main" onClick={() => !s.required && toggle(s.id)}>
        <span className="v2-cl-check" data-on={s.on}>{s.on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
        <div className="v2-cl-info"><div className="v2-cl-t">{s.title}</div><div className="v2-cl-n">{s.required ? 'Required' : s.note}</div></div>
        {s.editable && (
          <button className="v2-cl-pencil" title="Edit text" onClick={(e) => { e.stopPropagation(); onEdit(s.id); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function BuildChecklist({ sub, sections, toggle, perHome, setPerHome, onProse }) {
  const [editId, setEditId] = useState(null);
  const editing = sections.find((s) => s.id === editId);
  const onCount = sections.filter((s) => s.on).length;
  return (
    <div className="v2-checklist">
      <LeadCard sub={sub} perHome={perHome} setPerHome={setPerHome} />
      <div className="v2-checklist-head"><div className="t">Sections</div><div className="s">{onCount} of {sections.length} included · hover a row to edit its text</div></div>
      <div className="v2-cl-list">{sections.map((s) => <ClSection key={s.id} s={s} toggle={toggle} onEdit={setEditId} />)}</div>
      {editing && (
        <div className="ps-scrim" onClick={() => setEditId(null)}>
          <div className="ps-modal v2-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-head">
              <span className="t">{editing.title}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>{editing.note}</span>
              <button className="x" onClick={() => setEditId(null)}><I.Close width={15} height={15} /></button>
            </div>
            <div className="v2-edit-body">
              <label className="v2-edit-label">Section text · what the board reads</label>
              <textarea className="v2-edit-area" value={editing.prose || ''} autoFocus onChange={(e) => onProse(editing.id, e.target.value)} placeholder="Write the prose for this section…" />
              <div className="v2-edit-actions"><button className="btn btn-primary" onClick={() => setEditId(null)}>Done</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuildStage({ sub, sections, toggle, perHome, setPerHome, setProse, onContinue }) {
  // Live preview = the real board-facing proposal page in an iframe (so its
  // fixed accept/decline bar and full styling render in isolation). It's the
  // selected lead's CMGT-branded document at /proposals/board/:id.
  return (
    <div className="v2-build">
      <BuildChecklist sub={sub} sections={sections} toggle={toggle} perHome={perHome} setPerHome={setPerHome} onProse={setProse} />
      <div className="v2-browser">
        <div className="v2-browser-bar">
          <div className="v2-dots"><span /><span /><span /></div>
          <div className="v2-url"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>{CAM_COMPANY.shortName.toLowerCase()}.org/p/{sub.id.toLowerCase()}</div>
          <button className="v2-browser-open" onClick={() => window.open(BOARD_URL(sub), '_blank', 'noopener')}>
            Open full proposal
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></svg>
          </button>
          <span className="v2-browser-live"><span className="d" />Live preview</span>
        </div>
        <div className="v2-browser-body">
          <iframe className="v2-board-iframe" src={BOARD_URL(sub)} title="Live proposal preview — what the board sees" />
        </div>
        <div className="v2-browser-foot">
          <span className="v2-browser-foot-note">Exactly what {sub.firstName} sees at {CAM_COMPANY.shortName.toLowerCase()}.org/p/{sub.id.toLowerCase()} — open it full-screen in a new tab, or send when it's ready.</span>
          <button className="v2-mail-send v2-mail-send--purple" onClick={onContinue}>Continue to send<span className="v2-mail-send-ic"><I.Arrow width={18} height={18} /></span></button>
        </div>
      </div>
    </div>
  );
}

// ============================ SEND ============================
function MomentOfTruth({ sub, onSend }) {
  return (
    <div className="v2-send-step">
      <div className="v2-preview-bar">
        <span className="v2-preview-av v2-mail-av"><I.Send width={17} height={17} /></span>
        <div className="v2-preview-id">
          <div className="t">The email {sub.firstName} receives</div>
          <div className="s">From {CAM_COMPANY.shortName} · to {sub.contact} {'<' + sub.email + '>'} · with a one-tap magic link to the live proposal</div>
        </div>
        <div className="grow" />
        <button className="v2-mail-send" onClick={onSend}><span className="v2-mail-send-ic"><I.Send width={18} height={18} /></span>Send to {sub.firstName}</button>
      </div>
      <div className="v2-mail">
        <div className="v2-mail-toolbar">
          <span className="v2-mail-app"><span className="dot" /> Mail · Inbox</span>
          <div className="grow" />
          <div className="v2-mail-tools">
            <button title="Archive"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg></button>
            <button title="Reply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17l-5-5 5-5M4 12h11a4 4 0 0 1 4 4v2" /></svg></button>
            <button title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /></svg></button>
          </div>
        </div>
        <div className="v2-mail-headrow">
          <h3 className="v2-mail-subject">Your management proposal for {sub.community}</h3>
          <div className="v2-mail-meta">
            <span className="v2-mail-sender-av">A</span>
            <div className="v2-mail-who"><div className="from">{CAM_COMPANY.shortName} Community Management <span className="addr">{'<proposals@cmgt.org>'}</span></div><div className="to">to {sub.firstName} ▾</div></div>
            <div className="v2-mail-time">now</div>
          </div>
        </div>
        <div className="v2-mail-body">
          <div className="v2-email">
            <div className="v2-email-hd"><div className="v2-email-mark">{CAM_COMPANY.shortName}</div><div className="v2-email-mark-sub">{CAM_COMPANY.tagline}</div></div>
            <div className="v2-email-bd">
              <p>Hi {sub.firstName},</p>
              <p>Thank you for telling us about {sub.community}. We didn't send a generic pitch — we built a proposal around the {sub.concerns.length} concerns your board raised, point by point.</p>
              <div className="v2-email-card"><div className="row"><span>Community</span><b>{sub.community} · {sub.homes} homes</b></div><div className="row"><span>Recommended</span><b>{sub.tierName}</b></div></div>
              <a className="v2-email-cta" onClick={(e) => { e.preventDefault(); window.open(BOARD_URL(sub), '_blank', 'noopener'); }} href={BOARD_URL(sub)} target="_blank" rel="noopener">Open your proposal →</a>
              <div className="v2-email-secure">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6A5 5 0 0 1 6 7h3M8 12h8" /></svg>
                <span>One-tap secure link — no password to remember. It signs in {sub.firstName} automatically and works only from this email. Expires in 14 days.</span>
              </div>
              <p className="v2-email-sig">— Amanda Betancourt<br /><span>Client Partnerships · {CAM_COMPANY.shortName}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LaunchOverlay({ sub }) {
  return (
    <div className="v2-launch">
      <div className="v2-launch-card">
        <div className="v2-launch-sky">
          <svg className="v2-launch-trail" viewBox="0 0 220 120" fill="none" aria-hidden="true">
            <path d="M14 104 C 70 104, 120 70, 200 18" stroke="url(#lg)" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 9" />
            <defs><linearGradient id="lg" x1="0" y1="120" x2="220" y2="0"><stop offset="0" stopColor="#d9356e" stopOpacity="0" /><stop offset="1" stopColor="#d9356e" /></linearGradient></defs>
          </svg>
          <span className="v2-launch-plane"><I.Send width={30} height={30} /></span>
        </div>
        <div className="v2-launch-txt">Sending to {sub.firstName}…</div>
        <div className="v2-launch-sub">{sub.email}</div>
      </div>
    </div>
  );
}

function SentScreen({ sub, onPreview, onTrack, onBack }) {
  const pr = pricing(sub);
  return (
    <div className="v2-sent">
      <div className="v2-sent-ic"><I.Send width={30} height={30} /></div>
      <h2 className="v2-sent-h">Proposal sent to {sub.firstName}.</h2>
      <p className="v2-sent-sub">{sub.community} will get a secure link to the live proposal. It's now marked <b>Sent</b> in your queue, and we'll notify you the moment {sub.firstName} opens it.</p>
      <div className="v2-sent-card">
        <div className="v2-sent-row"><span className="k">Sent to</span><span className="v">{sub.contact} · {sub.email}</span></div>
        <div className="v2-sent-row"><span className="k">Community</span><span className="v">{sub.community} · {sub.homes} homes</span></div>
        <div className="v2-sent-row"><span className="k">Recommended tier</span><span className="v">{sub.tierName} · {pr.monthly}/mo</span></div>
        <div className="v2-sent-row"><span className="k">Secure link</span><span className="v">Expires in 14 days · magic link</span></div>
      </div>
      <div className="v2-sent-actions">
        <button className="btn btn-secondary" onClick={onPreview}><I.Search width={14} height={14} /> Preview as {sub.firstName}</button>
        <button className="btn btn-primary" onClick={onTrack}><I.TrendUp width={14} height={14} /> Track engagement</button>
        <button className="btn btn-secondary" onClick={onBack}>Back to queue</button>
      </div>
    </div>
  );
}

// ============================ CLOSE (engagement analytics) ============================
const HEAT = {
  hot: { label: 'Hot', cls: 'hot', hint: 'Actively reading · follow up now' },
  warm: { label: 'Warm', cls: 'warm', hint: 'Engaged · keep it moving' },
  cold: { label: 'Cold', cls: 'cold', hint: 'Going quiet · time to nudge' },
  new: { label: 'Just sent', cls: 'new', hint: 'Awaiting first open' },
};
const HEAT_RANK = { hot: 0, warm: 1, new: 2, cold: 3 };
const getWatch = (s) => s.watch || freshWatch(s);
function expState(w) {
  const frac = w.linkLife ? w.daysLeft / w.linkLife : 1;
  const cls = w.daysLeft <= 7 ? 'soon' : frac <= 0.4 ? 'mid' : 'ok';
  return { frac: Math.max(frac, 0.03), cls, label: w.daysLeft <= 0 ? 'Expired' : w.daysLeft + (w.daysLeft === 1 ? ' day left' : ' days left') };
}
function HeatPill({ heat, big }) { const h = HEAT[heat] || HEAT.cold; return <span className={'v2-w-heat v2-w-heat--' + h.cls + (big ? ' big' : '')}><span className="d" />{h.label}</span>; }
function ExpBar({ w }) { const e = expState(w); return <span className="v2-w-mini"><span className={'v2-w-mini-fill exp-' + e.cls} style={{ width: e.frac * 100 + '%' }} /></span>; }

function NudgeModal({ s, onClose, onSend }) {
  const w = getWatch(s);
  const [msg, setMsg] = useState(`Hi ${s.firstName},\n\nJust checking in on the proposal for ${s.community}. Happy to walk the board through any section — pricing, the 90-day onboarding, or how we mapped your concerns — on a quick call whenever works.\n\n— Amanda`);
  return (
    <div className="ps-scrim" onClick={onClose}>
      <div className="ps-modal v2-qual-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal-head">
          <span className="t">Nudge · {s.firstName}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>Last opened {w.lastOpened}</span>
          <button className="x" onClick={onClose}><I.Close width={15} height={15} /></button>
        </div>
        <div className="v2-qual-body">
          <label className="v2-qual-label">Follow-up message <span>· to {s.contact}</span></label>
          <textarea className="v2-edit-area" style={{ minHeight: 150 }} value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus />
          <div className="v2-qual-hint">Sends as a reply on the original thread, with the same secure link.</div>
          <div className="v2-qual-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { onSend(s); onClose(); }}><I.Send width={14} height={14} /> Send nudge</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadList({ open, selectedId, onPick }) {
  return (
    <aside className="v2-w-list">
      <div className="v2-w-list-head"><span className="t">Open proposals</span><span className="c">{open.length}</span></div>
      <div className="v2-w-list-rows">
        {open.map((s) => {
          const w = getWatch(s), e = expState(w);
          return (
            <button className="v2-w-row" key={s.id} data-heat={w.heat} data-active={s.id === selectedId} onClick={() => onPick(s.id)}>
              <div className="v2-w-row-top"><span className={'v2-w-row-dot h-' + w.heat} /><span className="v2-w-row-name">{s.community}</span><span className="v2-w-row-opens">{w.opens}<span className="u">{w.opens === 1 ? ' open' : ' opens'}</span></span></div>
              <div className="v2-w-row-meta">{s.contact} · {s.homes} homes</div>
              <div className="v2-w-row-exp"><ExpBar w={w} /><span className={'v2-w-row-exp-lbl exp-' + e.cls}>{e.label}</span></div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function LeadAnalytics({ s, onResend, onNudge, onMarkWon, onMarkLost, notes, addNote }) {
  const w = getWatch(s), e = expState(w);
  const [winOpen, setWinOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [note, setNote] = useState('');
  const pr = pricing(s);
  const figs = [
    { k: 'Total opens', v: w.opens, s: w.opens ? 'since sent ' + w.sentOn : 'not opened yet' },
    { k: 'Unique viewers', v: w.viewers.length, s: w.viewers.length ? 'board members' : '—' },
    { k: 'Time reading', v: w.readTime, s: 'all viewers combined' },
    { k: 'Link expires', v: e.label.replace(' left', ''), s: w.daysLeft <= 0 ? 'renew to reopen' : w.expires, exp: e.cls },
  ];
  return (
    <div className="v2-w-detail">
      <div className="v2-w-hero" data-heat={w.heat}>
        <div className="v2-w-hero-main">
          <div className="v2-w-hero-row"><HeatPill heat={w.heat} big /><span className="v2-w-hero-hint">{(HEAT[w.heat] || HEAT.cold).hint}</span></div>
          <h2 className="v2-w-hero-name">{s.community}</h2>
          <div className="v2-w-hero-meta">{s.contact} · {s.contactRole} · {s.homes} homes · {s.city}</div>
          <div className="v2-w-hero-sub">Sent {w.sentOn} · {pr.monthly}/mo · last opened {w.lastOpened}</div>
        </div>
        <div className="v2-w-hero-acts">
          <button className="v2-w-act primary" onClick={() => setNudgeOpen(true)}><I.Send width={14} height={14} /> Send a nudge</button>
          <button className="v2-w-act" onClick={() => onResend(s)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>
            Resend / extend link
          </button>
          <button className="v2-w-act win" onClick={() => setWinOpen(true)}><I.Check width={14} height={14} /> Mark won / lost</button>
        </div>
      </div>
      <div className="v2-w-figs">
        {figs.map((f) => (<div className="v2-w-fig" key={f.k} data-exp={f.exp || false}><div className="v2-w-fig-v">{f.v}</div><div className="v2-w-fig-k">{f.k}</div><div className="v2-w-fig-s">{f.s}</div></div>))}
      </div>
      <div className="v2-w-cols">
        <div className="v2-w-colmain">
          <div className="v2-card">
            <div className="v2-block-label">Section engagement · what they read vs. skipped</div>
            <div className="v2-w-secs">
              {w.sections.map((sec, i) => (
                <div className="v2-w-sec" key={i} data-st={sec.status}>
                  <span className="v2-w-sec-dot" />
                  <div className="v2-w-sec-info"><div className="v2-w-sec-name">{sec.name}{sec.note && <span className="v2-w-sec-note">{sec.note}</span>}</div><span className="v2-w-mini"><span className={'v2-w-mini-fill st-' + sec.status} style={{ width: Math.max(sec.pct, 3) + '%' }} /></span></div>
                  <span className="v2-w-sec-pct">{sec.status === 'unseen' ? '—' : sec.pct + '%'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="v2-card">
            <div className="v2-block-label">Who opened it</div>
            {w.viewers.length === 0 ? (<div className="v2-w-noviewers">No opens yet — the board hasn't viewed this proposal.</div>) : (
              <div className="v2-w-viewers">
                {w.viewers.map((v, i) => (
                  <div className="v2-w-viewer" key={i}><span className="v2-w-viewer-av">{v.initials}</span><div className="v2-w-viewer-id"><div className="nm">{v.name}</div><div className="rl">{v.role}</div></div><div className="v2-w-viewer-stat"><span className="o">{v.opens} {v.opens === 1 ? 'open' : 'opens'}</span><span className="s">last {v.lastSeen}</span></div></div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="v2-w-colside">
          <div className="v2-card">
            <div className="v2-block-label">Activity</div>
            <div className="v2-w-feed">
              {w.feed.map((f, i) => (<div className="v2-w-evt" key={i} data-type={f.type}><span className="v2-w-evt-dot" /><div className="v2-w-evt-body"><div className="v2-w-evt-main">{f.event}{f.detail && <span className="v2-w-evt-tag">{f.detail}</span>}</div><div className="v2-w-evt-meta">{f.who} · {f.when}</div></div></div>))}
            </div>
          </div>
          <div className="v2-card">
            <div className="v2-block-label">Internal notes</div>
            {(notes || []).length > 0 && (<div className="v2-w-notes">{notes.map((n, i) => (<div className="v2-w-note" key={i}><div className="v2-w-note-txt">{n.text}</div><div className="v2-w-note-meta">{n.who} · {n.when}</div></div>))}</div>)}
            <textarea className="v2-w-note-in" placeholder="Log a call, a board reaction, next step…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="v2-w-note-act"><button className="btn btn-primary" disabled={!note.trim()} onClick={() => { addNote(s.id, note.trim()); setNote(''); }}>Add note</button></div>
          </div>
        </div>
      </div>
      {nudgeOpen && <NudgeModal s={s} onClose={() => setNudgeOpen(false)} onSend={onNudge} />}
      {winOpen && <WinModal s={s} onClose={() => setWinOpen(false)} onWin={onMarkWon} onLose={onMarkLost} />}
    </div>
  );
}

function CloseView({ subs, watchId, setWatchId, onResend, onNudge, onMarkWon, onMarkLost, notesMap, addNote }) {
  const open = subs.filter((s) => s.status === 'sent').sort((a, b) => HEAT_RANK[getWatch(a).heat] - HEAT_RANK[getWatch(b).heat]);
  if (open.length === 0) {
    return <div className="v2-watch"><div className="v2-w-empty"><span className="ic"><I.Send width={22} height={22} /></span><div className="t">No live proposals yet</div><div className="s">Send a proposal and it'll show up here so you can track every open.</div></div></div>;
  }
  const selected = (watchId && open.find((s) => s.id === watchId)) || open[0];
  const hot = open.filter((s) => getWatch(s).heat === 'hot').length;
  return (
    <div className="v2-watch">
      <div className="v2-w-head">
        <div>
          <div className="v2-w-eyebrow">Live proposals</div>
          <h2 className="v2-w-title">Who's reading, and how closely.</h2>
          <p className="v2-w-sub">Pick a proposal on the left to see its engagement. {hot > 0 ? <b>{hot} {hot === 1 ? 'lead is' : 'leads are'} hot right now.</b> : 'Nudge the quiet ones before their link expires.'}</p>
        </div>
        <div className="v2-w-legend">
          <span className="v2-w-leg"><span className="v2-w-heat v2-w-heat--hot"><span className="d" />Hot</span></span>
          <span className="v2-w-leg"><span className="v2-w-heat v2-w-heat--warm"><span className="d" />Warm</span></span>
          <span className="v2-w-leg"><span className="v2-w-heat v2-w-heat--cold"><span className="d" />Cold</span></span>
        </div>
      </div>
      <div className="v2-w-split">
        <LeadList open={open} selectedId={selected.id} onPick={setWatchId} />
        <LeadAnalytics key={selected.id} s={selected} onResend={onResend} onNudge={onNudge}
          onMarkWon={(id, v) => { onMarkWon(id, v); setWatchId(null); }} onMarkLost={(id) => { onMarkLost(id); setWatchId(null); }}
          notes={notesMap[selected.id]} addNote={addNote} />
      </div>
    </div>
  );
}

// ============================ RETAIN ============================
function RetainView({ subs }) {
  const justWon = subs.filter((s) => s.status === 'accepted');
  const inRetention = [
    { name: 'Cypress Landing', contact: 'Marla Reyes', homes: 142, city: 'Tampa, FL', value: 16140, since: 'Since 2023', health: 'ok', healthLabel: 'Healthy' },
    { name: 'Oakmont Ridge', contact: 'Daniel Voss', homes: 88, city: 'Austin, TX', value: 9900, since: 'Since 2022', health: 'ok', healthLabel: 'Healthy' },
    { name: 'Harbor Point', contact: 'Ellen Tran', homes: 210, city: 'Mobile, AL', value: 23100, since: 'Since 2021', health: 'watch', healthLabel: 'Renewal in 60d' },
  ];
  const newRows = justWon.map((s) => ({ name: s.community, contact: s.contact, homes: s.homes, city: s.city, value: s.salesValue || s.quoteValue, since: 'Won this week', health: 'new', healthLabel: 'New', isNew: true }));
  const rows = [...newRows, ...inRetention];
  const Row = ({ r }) => (
    <div className="v2-rt-row" data-new={!!r.isNew}>
      <span className={'v2-rt-dot ' + r.health} />
      <div className="v2-rt-row-id"><div className="n">{r.name}{r.isNew && <span className="v2-rt-new">New</span>}</div><div className="m">{r.contact} · {r.homes} homes · {r.city}</div></div>
      <div className="v2-rt-row-val"><span className="n">${r.value.toLocaleString()}</span><span className="l">{r.since}</span></div>
      <span className={'v2-rt-pill ' + r.health}>{r.healthLabel}</span>
      <span className="v2-rt-go">Open in Retention <I.Arrow width={15} height={15} /></span>
    </div>
  );
  return (
    <div className="v2-watch">
      <div className="v2-w-head">
        <div>
          <div className="v2-w-eyebrow">Retain</div>
          <h2 className="v2-w-title">Won — now handed to Retention.</h2>
          <p className="v2-w-sub">Proposals ends at the close. Every community you win moves into <b>Retention</b> — a portal module for onboarding, renewals, account health, and board sentiment. This is just the handoff, so the progression is always clear.</p>
        </div>
      </div>
      <div className="v2-rt-bridge">
        <div className="v2-rt-bridge-ic"><I.TrendUp width={20} height={20} /></div>
        <div className="v2-rt-bridge-txt"><div className="t">Retention is its own module</div><div className="s">Day-to-day retention lives outside Proposals. Open it to manage the full book of business.</div></div>
        <button className="btn btn-primary v2-rt-bridge-btn">Open Retention <I.Arrow width={15} height={15} /></button>
        <span className="v2-rt-soon">Coming soon</span>
      </div>
      <div className="v2-block-label">Moved to Retention · {rows.length} communities</div>
      <div className="v2-rt-list">{rows.map((r) => <Row key={r.name} r={r} />)}</div>
    </div>
  );
}

// ============================ Stepper + shell ============================
function Stepper({ mode, go }) {
  const order = { review: 0, build: 1, send: 2, sent: 2, close: 3, retain: 4 };
  const steps = [['review', 'Review', 1], ['build', 'Build', 2], ['send', 'Send', 3], ['close', 'Close', 4]];
  const wrapRef = useRef(null);
  const [pill, setPill] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const [glide, setGlide] = useState(false);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const el = wrap.querySelector('.v2-step[data-active="true"]');
    if (el) setPill({ left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    else setPill((p) => ({ ...p, w: 0 }));
  }, [mode]);
  useEffect(() => { const id = requestAnimationFrame(() => setGlide(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="v2-steps-row">
      <div className="v2-stepper" ref={wrapRef}>
        <span className={'v2-step-pill' + (glide ? ' glide' : '')} style={{ transform: `translateX(${pill.left}px)`, top: pill.top, width: pill.w, height: pill.h }} />
        {steps.map(([id, label, n], i) => {
          const active = mode === id || (id === 'send' && mode === 'sent');
          const done = order[mode] > order[id];
          return (
            <React.Fragment key={id}>
              {i > 0 && <span className="v2-step-sep" />}
              <button className="v2-step" data-active={active} data-done={done} onClick={() => go(id)}><span className="num">{done ? '✓' : n}</span>{label}</button>
            </React.Fragment>
          );
        })}
      </div>
      <button className="v2-retain-link" data-active={mode === 'retain'} onClick={() => go('retain')}><span className="ico"><I.TrendUp width={13} height={13} /></span>Retain</button>
    </div>
  );
}

export default function ProposalsScreen() {
  // Live proposals (Supabase) when configured + seeded, else the mock pipeline.
  const initialLeads = getLeads();
  const [subs, setSubs] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0].id);
  const [mode, setMode] = useState('review');
  const [watchId, setWatchId] = useState(null);
  // Internal notes seed from the DB proposal's notes (live) — so they survive reload.
  const [notesMap, setNotesMap] = useState(() => { const m = {}; initialLeads.forEach((s) => { if (s.notes && s.notes.length) m[s.id] = s.notes; }); return m; });
  const [toast, setToast] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [editorMap, setEditorMap] = useState(() => { const m = {}; initialLeads.forEach((s) => { m[s.id] = (s.sections || []).map((x) => ({ ...x })); }); return m; });
  const [perHomeMap, setPerHomeMap] = useState({});

  const sub = subs.find((s) => s.id === selectedId) || subs[0];
  const sections = editorMap[selectedId] || [];
  const perHome = perHomeMap[selectedId] != null ? perHomeMap[selectedId] : sub.perHome;

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);

  // Persist a proposal mutation to Supabase (live only; mock dev stays
  // session-local). RLS-scoped to the viewed account; keyed by lead_key.
  const live = isSupabaseConfigured && !!DATA.account?.id;
  const persist = (leadKey, patch) => {
    if (!live) return;
    supabase.from('proposals').update(patch)
      .eq('account_id', DATA.account.id).eq('lead_key', leadKey)
      .then(({ error }) => { if (error) setToast({ msg: 'Save failed: ' + error.message }); });
  };

  const go = (id) => { if (id === 'close') setWatchId(null); setMode(id); };
  const selectSub = (id) => { setSelectedId(id); setMode('review'); };
  const qualify = (id, owner, quoteValue) => {
    setSubs(subs.map((s) => s.id === id ? { ...s, status: 'review', owner, quoteValue, disq: false, disqReason: null } : s));
    persist(id, { status: 'review', owner: owner || '', quote_value: quoteValue ?? null, disq: false, disq_reason: '' });
  };
  const disqualify = (id, reason) => {
    setSubs(subs.map((s) => s.id === id ? { ...s, disq: true, disqReason: reason } : s));
    persist(id, { disq: true, disq_reason: reason || '' });
  };
  const markWon = (id, salesValue) => {
    setSubs(subs.map((s) => s.id === id ? { ...s, status: 'accepted', salesValue } : s));
    persist(id, { status: 'accepted', sales_value: salesValue ?? null });
  };
  const markLost = (id) => {
    setSubs(subs.map((s) => s.id === id ? { ...s, status: 'declined' } : s));
    persist(id, { status: 'declined' });
  };
  const addNote = (id, text) => {
    const next = [{ who: 'Amanda B.', when: 'Just now', text }, ...(notesMap[id] || [])];
    setNotesMap((m) => ({ ...m, [id]: next }));
    persist(id, { notes: next });
  };
  const toggle = (id) => setEditorMap({ ...editorMap, [selectedId]: sections.map((s) => (s.id === id && !s.required ? { ...s, on: !s.on } : s)) });
  const setProse = (id, text) => setEditorMap({ ...editorMap, [selectedId]: sections.map((s) => (s.id === id ? { ...s, prose: text } : s)) });
  const setPerHome = (v) => {
    setPerHomeMap({ ...perHomeMap, [selectedId]: v });
    if (Number.isFinite(Number(v))) persist(selectedId, { per_home: Number(v) });
  };
  const send = () => {
    setSubs(subs.map((s) => (s.id === selectedId && s.status !== 'accepted' ? { ...s, status: 'sent' } : s)));
    if (sub && sub.status !== 'accepted') persist(selectedId, { status: 'sent', sent_at: new Date().toISOString() });
    setMode('sent');
  };
  const launch = () => { setLaunching(true); setTimeout(() => { setLaunching(false); send(); }, 1850); };

  return (
    <div className="proposal-system">
      <div className="v2-topline">
        <Stepper mode={mode} go={go} />
        <button className="v2-lib-btn" data-on={mode === 'library'} onClick={() => setMode('library')} title="The capabilities every proposal matches against">
          <I.Bolt width={14} height={14} /> UVP Library
        </button>
      </div>

      {mode === 'review' && (
        <ReviewScreen subs={subs} selectedId={selectedId} sub={sub} onSelect={selectSub} onBuild={() => setMode('build')} onQualify={qualify} onDisqualify={disqualify} onMarkWon={markWon} onMarkLost={markLost} />
      )}
      {mode === 'build' && (
        <BuildStage sub={sub} sections={sections} toggle={toggle} perHome={perHome} setPerHome={setPerHome} setProse={setProse} onContinue={() => setMode('send')} />
      )}
      {mode === 'send' && <MomentOfTruth sub={sub} onSend={launch} />}
      {mode === 'sent' && (
        <SentScreen sub={sub} onPreview={() => window.open(BOARD_URL(sub), '_blank', 'noopener')} onTrack={() => { setWatchId(selectedId); setMode('close'); }} onBack={() => setMode('review')} />
      )}
      {mode === 'close' && (
        <CloseView subs={subs} watchId={watchId} setWatchId={setWatchId}
          onResend={(s) => setToast({ msg: `Magic link resent to ${s.firstName} · expires in 14 days` })}
          onNudge={(s) => setToast({ msg: `Nudge sent to ${s.firstName} on the original thread` })}
          onMarkWon={markWon} onMarkLost={markLost} notesMap={notesMap} addNote={addNote} />
      )}
      {mode === 'retain' && <RetainView subs={subs} />}
      {mode === 'library' && <UVPLibrary />}

      {launching && <LaunchOverlay sub={sub} />}
      {toast && <div className="ps-toast"><span className="ic"><I.Check width={14} height={14} /></span>{toast.msg}</div>}
    </div>
  );
}
