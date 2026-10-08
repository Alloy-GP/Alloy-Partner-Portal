import React from 'react';
import { I } from './icons.jsx';
import { pickDefaultAgent, previewTicket, summarizeTickets, parseEmails } from '../lib/intakeTicket.js';

const { useState, useEffect } = React;

// Staff tracker for a client intake round: newsletter content, quarterly
// meeting prep — anything that works as "open a round for some clients, each
// fills a short form from a tagged ticket, staff read the answers and close".
// The data model (`<x>_requests`: open | submitted | closed, one live row per
// client), the `admin` fn actions and the engagement roll-up are identical
// across intakes, so the page is too. Each intake passes its copy + API + a
// read-only renderer for its submission shape (`AdminNewsletter`,
// `AdminQuarterly`).
//
// Opening a round also SENDS the client's prompt ticket from here (pending +
// tagged, so their portal shows "Open Form"): staff pick who it sends as
// (default Sharlene) and, per client, who it goes to (default: the portal
// owner), and can edit the subject/message. `api.prep()` supplies the agents
// and each org's users; `api.open(..., ticket)` creates the tickets.
//
// `api`  = { list, open(accountIds, title, due, ticket), close(id), remove(id), prep? }
// `copy` = { noun, openTitle, openHelp, titlePlaceholder, defaultTitle(),
//            fallbackTitle, deleteConfirm, empty, submittedLabel,
//            ticket: { subject, message } }
// `renderSubmission(sub)` → node (or null)

const ZD_BASE = 'https://alloycreatives.zendesk.com/agent/tickets/';

const STATUS = {
  open: { label: 'Open · waiting', bg: 'var(--alloy-pink-tint)', fg: 'var(--alloy-pink)' },
  submitted: { label: 'Submitted', bg: 'var(--alloy-green-tint)', fg: 'var(--dark-green, #2c6e62)' },
  closed: { label: 'Closed', bg: 'var(--alloy-off-white)', fg: 'var(--fg-muted)' },
};

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 };

export function fmtDateTime(s) {
  const d = new Date(s || '');
  if (Number.isNaN(d.getTime())) return '';
  try { return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; } catch { return String(s); }
}

export function fmtDate(s) {
  if (!s) return '';
  // Date-only strings (due_date, 'YYYY-MM-DD') parse as UTC midnight and can
  // render a day early in negative-offset zones — pin them to local midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; }
}

// One labelled answer, read-only; null when blank so a submission never shows
// empty headings. Shared by the per-intake submission renderers.
export function SubmissionRow({ label, value }) {
  if (!value || !String(value).trim()) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

export default function AdminIntakeRounds({ api, copy, renderSubmission }) {
  const [data, setData] = useState(null); // { requests, accounts }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // string[] lines
  const [expanded, setExpanded] = useState({});

  // "Open a round" form
  const [title, setTitle] = useState(copy.defaultTitle());
  const [due, setDue] = useState('');
  const [picked, setPicked] = useState({}); // account_id -> bool

  // The prompt ticket. `prep` = null while loading, then { agents, defaultAgentId,
  // recipients, defaults, errors } or { error } when Zendesk couldn't be reached
  // (the round can still open; tickets just can't be sent from here).
  const canTicket = !!(api.prep && copy.ticket);
  const [prep, setPrep] = useState(null);
  const [sendTicket, setSendTicket] = useState(canTicket);
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState((copy.ticket && copy.ticket.subject) || '');
  const [message, setMessage] = useState((copy.ticket && copy.ticket.message) || '');
  const [recip, setRecip] = useState({}); // account_id -> zendesk user id
  const [cc, setCc] = useState({}); // account_id -> [zendesk user id]: other org contacts to copy
  const [ccEmails, setCcEmails] = useState(''); // "also CC" on every ticket, free text
  const [showPreview, setShowPreview] = useState(false);

  const load = async () => {
    try {
      const res = await api.list();
      setData({ requests: res.requests || [], accounts: res.accounts || [] });
    } catch (e) { setError(String(e.message || e)); setData({ requests: [], accounts: [] }); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canTicket) return;
    let cancelled = false;
    api.prep().then((p) => {
      if (cancelled) return;
      const agents = p.agents || [];
      const def = p.defaultAgentId || (pickDefaultAgent(agents) || {}).id || '';
      setPrep({ agents, defaultAgentId: def, recipients: p.recipients || {}, defaults: p.defaults || {}, errors: p.errors || {} });
      setSenderId(def);
      setRecip(p.defaults || {});
    }).catch((e) => {
      if (cancelled) return;
      setPrep({ error: String(e.message || e), agents: [], recipients: {}, defaults: {}, errors: {} });
      setSendTicket(false);
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <div className="card card-pad" style={{ color: 'var(--alloy-pink)' }}>{error}</div>;
  if (!data) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading…</div>;

  const { requests, accounts } = data;
  const nameOf = {};
  accounts.forEach((a) => { nameOf[a.id] = a.short_name || a.company; });
  // Accounts that already have a live (open/submitted) round → can't re-open.
  const liveByAccount = {};
  requests.forEach((r) => { if (r.status !== 'closed') liveByAccount[r.account_id] = r; });

  const selectable = accounts.filter((a) => !liveByAccount[a.id]);
  const allSelected = selectable.length > 0 && selectable.every((a) => picked[a.id]);
  const pickedIds = selectable.filter((a) => picked[a.id]).map((a) => a.id);
  const pickedCount = pickedIds.length;

  const toggle = (id) => setPicked((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = () => {
    if (allSelected) setPicked({});
    else { const next = {}; selectable.forEach((a) => { next[a.id] = true; }); setPicked(next); }
  };

  const agents = (prep && prep.agents) || [];
  const sender = agents.find((a) => a.id === senderId) || null;
  const recipientsFor = (id) => (prep && prep.recipients && prep.recipients[id]) || [];
  const recipientOf = (id) => recipientsFor(id).find((u) => u.id === recip[id]) || null;
  const ticketOn = canTicket && sendTicket && prep && !prep.error;
  // Picked clients the ticket can't reach (no Zendesk org / no users) — the
  // round still opens for them; staff make that ticket by hand.
  const unreachable = ticketOn ? pickedIds.filter((id) => !recipientOf(id)) : [];
  const previewFor = ticketOn ? pickedIds.find((id) => recipientOf(id)) : null;
  const preview = previewFor ? previewTicket({ subject, message }, {
    recipient: recipientOf(previewFor), account: accounts.find((a) => a.id === previewFor), title: title.trim() || copy.fallbackTitle, sender,
  }) : null;

  const openRound = async () => {
    if (!pickedIds.length) { setError('Pick at least one client.'); return; }
    setBusy(true); setError(''); setNotice(null);
    try {
      const ticket = ticketOn ? {
        send: true, senderId, subject, message,
        recipients: Object.fromEntries(pickedIds.filter((id) => recipientOf(id)).map((id) => [id, recip[id]])),
        cc: Object.fromEntries(pickedIds.filter((id) => recipientOf(id) && (cc[id] || []).some((u) => u !== recip[id]))
          .map((id) => [id, (cc[id] || []).filter((u) => u !== recip[id])])),
        ccEmails: parseEmails(ccEmails),
      } : null;
      const res = await api.open(pickedIds, title.trim() || copy.fallbackTitle, due || null, ticket);
      const lines = [`Opened for ${res.opened} client${res.opened === 1 ? '' : 's'}${res.skipped ? ` · ${res.skipped} skipped (already had a live round)` : ''}.`];
      lines.push(...summarizeTickets(res.tickets, nameOf));
      setNotice(lines);
      setPicked({});
      await load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const close = async (id) => {
    setBusy(true); setError('');
    try { await api.close(id); await load(); }
    catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const del = async (id) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    setBusy(true); setError('');
    try { await api.remove(id); await load(); }
    catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const open = requests.filter((r) => r.status === 'open');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const closed = requests.filter((r) => r.status === 'closed');

  const StatusPill = ({ s }) => {
    const st = STATUS[s] || STATUS.closed;
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>;
  };

  const Chip = ({ on, icon, children, title: t, href }) => {
    const style = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: on ? 'rgba(75,134,180,0.12)' : 'var(--alloy-off-white)', color: on ? '#3a6f96' : 'var(--fg-muted)', textDecoration: 'none' };
    return href
      ? <a href={href} target="_blank" rel="noopener noreferrer" title={t} style={style}>{icon} {children}</a>
      : <span title={t} style={style}>{icon} {children}</span>;
  };

  const Row = ({ r }) => {
    const isOpen = !!expanded[r.id];
    const a = r.analytics || { opens: 0, openerCount: 0, openers: [] };
    const filledOut = r.status === 'submitted' || (a.submits || 0) > 0;
    const submissionNode = r.submission ? renderSubmission(r.submission) : null;
    // Show the expand toggle when there's a submission OR opener detail to see.
    const hasDetail = !!submissionNode || (a.openers && a.openers.length > 0);
    const pm = r.prompt_meta || {};
    return (
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--alloy-purple)' }}>{r.account_name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
              {r.title}{r.due_date ? ` · due ${fmtDate(r.due_date)}` : ''}
              {r.submitted_at ? ` · submitted ${fmtDate(r.submitted_at)}${r.submitted_by ? ` by ${r.submitted_by}` : ''}` : ''}
            </div>
            {/* Prompt ticket + engagement analytics */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
              {r.prompt_ticket_id ? (
                <Chip on icon={<I.Send width={12} height={12} />} href={`${ZD_BASE}${r.prompt_ticket_id}`}
                  title={`Prompt ticket #${r.prompt_ticket_id}${pm.sent_at ? ` · sent ${fmtDate(pm.sent_at)}` : ''}${(pm.cc || []).length ? ` · cc ${pm.cc.map((c) => c.name || c.email).join(', ')}` : ''}`}>
                  Sent to {pm.requester_name || 'client'}{pm.sender_name ? ` as ${firstName(pm.sender_name)}` : ''} ↗
                </Chip>
              ) : r.status === 'open' ? (
                <Chip icon={<I.Send width={12} height={12} />} title="No prompt ticket was sent from the portal — tag the client's ticket by hand.">No prompt ticket</Chip>
              ) : null}
              <Chip on={!!a.opens} icon={<I.Eye width={12} height={12} />} title={`${a.opens || 0} total clicks on "Open Form"`}>
                {a.opens ? `Opened ${a.opens}× · ${a.openerCount} ${a.openerCount === 1 ? 'person' : 'people'}` : 'Not opened yet'}
              </Chip>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: filledOut ? 'var(--alloy-green-tint)' : 'var(--alloy-off-white)', color: filledOut ? 'var(--dark-green, #2c6e62)' : 'var(--fg-muted)' }}>
                <I.Check width={12} height={12} /> {filledOut ? 'Filled out' : 'Not submitted'}
              </span>
              {r.meeting_at ? (
                <Chip on icon={<I.Calendar width={12} height={12} />} title={`Booked from the portal${(r.meeting_meta || {}).booked_at ? ` on ${fmtDate(r.meeting_meta.booked_at)}` : ''}`}>
                  Meeting booked · {fmtDateTime(r.meeting_at)}
                </Chip>
              ) : null}
            </div>
          </div>
          <StatusPill s={r.status} />
          {r.zendesk_ticket_id ? (
            <a className="btn btn-ghost btn-sm" href={`${ZD_BASE}${r.zendesk_ticket_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--alloy-purple)' }}>Ticket ↗</a>
          ) : null}
          {hasDetail ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}>{isOpen ? 'Hide' : 'View'}</button>
          ) : null}
          {r.status !== 'closed' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => close(r.id)} disabled={busy}>Close</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => del(r.id)} disabled={busy} style={{ color: 'var(--alloy-pink)' }}>Delete</button>
          )}
        </div>
        {isOpen && hasDetail ? (
          <div style={{ padding: '0 14px 14px' }}>
            {a.openers && a.openers.length ? (
              <div style={{ background: 'var(--alloy-off-white)', borderRadius: 10, padding: '10px 14px', marginTop: 4, marginBottom: submissionNode ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 6 }}>Who opened it</div>
                {a.openers.map((o, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--fg)', padding: '2px 0' }}>
                    <span>{o.name}</span>
                    <span style={{ color: 'var(--fg-muted)' }}>{o.count} {o.count === 1 ? 'open' : 'opens'}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {submissionNode}
          </div>
        ) : null}
      </div>
    );
  };

  const Section = ({ label, rows }) => rows.length ? (
    <div className="card" style={{ padding: 0, marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)' }}>{label} · {rows.length}</div>
      {rows.map((r) => <Row key={r.id} r={r} />)}
    </div>
  ) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Open a round */}
      <div className="card card-pad" style={{ alignSelf: 'start' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)', marginBottom: 4 }}>{copy.openTitle}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14 }}>{copy.openHelp}</div>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={LABEL}>Round title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={copy.titlePlaceholder} style={{ width: '100%', boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={LABEL}>Due date (optional)</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        </label>

        {/* The prompt ticket — sent from here so nobody has to make it in Zendesk. */}
        {canTicket ? (
          <div data-testid="ticket-panel" style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!ticketOn} disabled={!prep || !!prep.error} onChange={(e) => setSendTicket(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Send the Zendesk ticket too</span>
            </label>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', margin: '3px 0 0 24px' }}>
              {!prep ? 'Loading agents and contacts from Zendesk…'
                : prep.error ? `Couldn’t reach Zendesk (${prep.error}). Open the round, then tag the client’s ticket by hand.`
                : 'Pending + tagged, so the client sees “Open Form” in their portal. Pick who it goes to under each client.'}
            </div>
            {prep && !prep.error && ticketOn ? (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <span style={LABEL}>Send as</span>
                  <select className="input" value={senderId} onChange={(e) => setSenderId(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Send as">
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.email ? ` · ${a.email}` : ''}</option>)}
                  </select>
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <span style={LABEL}>Subject</span>
                  <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Ticket subject" />
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  <span style={LABEL}>Message</span>
                  <textarea className="input" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12.5, lineHeight: 1.5 }} aria-label="Ticket message" />
                </label>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                  <code>{'{name}'}</code> recipient’s first name · <code>{'{client}'}</code> · <code>{'{title}'}</code> · <code>{'{sender}'}</code>
                  {preview ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)} style={{ marginLeft: 6 }}>
                      {showPreview ? 'Hide preview' : `Preview for ${nameOf[previewFor]}`}
                    </button>
                  ) : null}
                </div>
                {preview && showPreview ? (
                  <div data-testid="ticket-preview" style={{ background: 'var(--alloy-off-white)', borderRadius: 8, padding: '8px 10px', marginTop: 6, fontSize: 12.5 }}>
                    <div style={{ fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>{preview.subject}</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: 'var(--fg-2)', lineHeight: 1.5 }}>{preview.message}</div>
                  </div>
                ) : null}
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={LABEL}>Also CC on every ticket (optional)</span>
                  <input className="input" value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="name@company.com, other@company.com"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} aria-label="Also CC" />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ ...LABEL, flex: 1, marginBottom: 0 }}>Clients ({pickedCount} selected)</span>
          {selectable.length ? <button className="btn btn-ghost btn-sm" onClick={toggleAll}>{allSelected ? 'Clear' : 'Select all'}</button> : null}
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, maxHeight: 360, overflowY: 'auto' }}>
          {accounts.map((a) => {
            const live = liveByAccount[a.id];
            const users = recipientsFor(a.id);
            const showTo = ticketOn && !live && picked[a.id];
            return (
              <div key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: live ? 'default' : 'pointer', opacity: live ? 0.55 : 1 }}
                  title={live ? `Already has a live round (${live.status})` : ''}>
                  <input type="checkbox" data-role="pick" disabled={!!live} checked={!!picked[a.id]} onChange={() => toggle(a.id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{a.short_name || a.company}</span>
                    {live ? <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{live.status === 'submitted' ? 'Submitted' : 'Round open'}</span> : null}
                  </span>
                </label>
                {showTo ? (
                  <div style={{ padding: '0 12px 9px 33px' }}>
                    {users.length ? (<>
                      <select className="input" value={recip[a.id] || ''} onChange={(e) => setRecip((r) => ({ ...r, [a.id]: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} aria-label={`Send to (${a.short_name || a.company})`}>
                        {users.map((u) => <option key={u.id} value={u.id}>To: {u.name}{u.portalRole === 'owner' ? ' · portal owner' : ''}{u.email ? ` · ${u.email}` : ''}</option>)}
                      </select>
                      {users.length > 1 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 5, fontSize: 11.5, color: 'var(--fg-2)' }}>
                          <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>CC:</span>
                          {users.filter((u) => u.id !== (recip[a.id] || '')).map((u) => (
                            <label key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input type="checkbox" checked={(cc[a.id] || []).includes(u.id)} aria-label={`CC ${u.name} (${a.short_name || a.company})`}
                                onChange={(e) => setCc((c) => ({ ...c, [a.id]: e.target.checked ? [...(c[a.id] || []), u.id] : (c[a.id] || []).filter((x) => x !== u.id) }))} />
                              {u.name}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </>) : (
                      <span style={{ fontSize: 11.5, color: 'var(--alloy-pink)' }}>
                        {prep && prep.errors && prep.errors[a.id] ? `Zendesk: ${prep.errors[a.id]}` : 'No Zendesk org or contacts mapped — round opens, no ticket.'}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {accounts.length === 0 ? <div style={{ padding: 12, fontSize: 12.5, color: 'var(--fg-muted)' }}>No clients yet.</div> : null}
        </div>

        <button className="btn btn-primary" onClick={openRound} disabled={busy || !pickedCount} style={{ marginTop: 12, width: '100%' }}>
          {busy ? 'Opening…' : `Open round for ${pickedCount || 0} client${pickedCount === 1 ? '' : 's'}${ticketOn && pickedCount ? ` · send ${pickedCount - unreachable.length} ticket${pickedCount - unreachable.length === 1 ? '' : 's'}` : ''}`}
        </button>
        {notice ? (
          <div style={{ marginTop: 10, background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>
            {notice.map((l, i) => <div key={i} style={{ color: l.startsWith('⚠') ? 'var(--alloy-pink)' : undefined }}>{l}</div>)}
          </div>
        ) : null}
        {error ? <div style={{ marginTop: 10, background: 'var(--alloy-pink-tint)', color: 'var(--alloy-pink)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{error}</div> : null}
      </div>

      {/* Tracker */}
      <div>
        {requests.length === 0 ? (
          <div className="card card-pad" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{copy.empty}</div>
        ) : (
          <>
            <Section label="Waiting on the client" rows={open} />
            <Section label={copy.submittedLabel} rows={submitted} />
            <Section label="Closed" rows={closed} />
          </>
        )}
      </div>
    </div>
  );
}
