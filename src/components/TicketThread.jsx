import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { zdThread, zdReply, zdResolve, zdUpload, zdAddCc } from '../lib/zendesk.js';

const { useState, useEffect, useRef } = React;

function relTime(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function initials(name) {
  return (name || '').split(' ').map((w) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function Attachment({ a }) {
  const isImg = (a.contentType || '').startsWith('image/') && (a.thumb || a.url);
  if (isImg) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" title={a.name} style={{ display: 'inline-block' }}>
        <img src={a.thumb || a.url} alt={a.name}
          style={{ maxWidth: 220, maxHeight: 170, borderRadius: 8, display: 'block', border: '1px solid var(--border-subtle)' }} />
      </a>
    );
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '7px 11px', background: 'var(--alloy-off-white)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--alloy-purple)', textDecoration: 'none', fontWeight: 600 }}>
      <I.Paperclip width={13} height={13} /> {a.name}
      {a.size ? <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{fmtSize(a.size)}</span> : null}
    </a>
  );
}

// Turn links in a plain-text ticket body into clickable anchors: both bare
// http(s) URLs and the [label](url) markdown Zendesk leaves in email-sourced
// comments. Builds React nodes (never dangerouslySetInnerHTML) and only emits
// http/https hrefs, so it's XSS-safe — anything else stays inert text.
function linkify(text) {
  if (!text) return text;
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  const nodes = [];
  let last = 0, m, key = 0;
  const A = (href, label) => (
    <a key={`lk${key++}`} href={href} target="_blank" rel="noreferrer noopener"
      style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600, wordBreak: 'break-word' }}>{label}</a>
  );
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) nodes.push(A(m[2], m[1]));   // [label](url)
    else nodes.push(A(m[3], m[3]));                 // bare url
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Bubble({ m }) {
  const mine = m.mine;
  const atts = m.attachments || [];
  return (
    <div style={{ display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '85%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, background: mine ? 'linear-gradient(135deg, var(--alloy-yellow), var(--alloy-pink))' : 'var(--alloy-purple)', color: mine ? 'var(--alloy-purple)' : '#fff' }}>
        {initials(m.author)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexDirection: mine ? 'row-reverse' : 'row' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--alloy-purple)' }}>{m.author}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{relTime(m.created_at)}</span>
        </div>
        {m.body && m.body.trim() ? (
          <div style={{ padding: '12px 14px', background: mine ? 'var(--alloy-purple)' : '#fff', color: mine ? '#fff' : 'var(--fg-3)', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5, border: mine ? 'none' : '1px solid var(--border-subtle)', whiteSpace: 'pre-wrap' }}>
            {linkify(m.body)}
          </div>
        ) : null}
        {atts.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: m.body && m.body.trim() ? 8 : 0, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            {atts.map((a) => <Attachment key={a.id} a={a} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders one Zendesk ticket's public conversation, with a reply box.
 * `id` is the Zendesk ticket id. Re-fetches whenever the id changes.
 */
function TicketThread({ id, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState([]);          // staged File objects to attach
  const [cc, setCc] = useState('');                // comma-separated CCs for this reply
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [addingCc, setAddingCc] = useState(false);
  const [newCc, setNewCc] = useState('');          // header "add CC" field
  const fileInput = useRef(null);
  const isStaff = !!(DATA.user && DATA.user.isStaff);
  const [replyStatus, setReplyStatus] = useState('pending'); // staff-only: status after reply

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await zdThread(id);
      setData(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) { setReply(''); setFiles([]); setCc(''); setNewCc(''); load(); } /* eslint-disable-next-line */ }, [id]);

  const send = async () => {
    const text = reply.trim();
    if (!text && files.length === 0) return;
    setSending(true);
    try {
      // Stage any attachments first, then post the reply with their tokens.
      const uploads = [];
      for (const f of files) {
        const token = await zdUpload(f);
        if (token) uploads.push(token);
      }
      const ccArr = cc.split(',').map((s) => s.trim()).filter(Boolean);
      await zdReply(id, text, { status: isStaff ? replyStatus : undefined, uploads, cc: ccArr });
      setReply(''); setFiles([]); setCc('');
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSending(false);
    }
  };

  const addCc = async () => {
    const emails = newCc.split(',').map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    setAddingCc(true);
    try {
      await zdAddCc(id, emails);
      setNewCc('');
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setAddingCc(false);
    }
  };

  const resolve = async () => {
    setResolving(true);
    try {
      await zdResolve(id);
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px 22px', color: 'var(--fg-muted)', fontSize: 13 }}>Loading conversation…</div>;
  }
  if (error) {
    return <div style={{ padding: '22px', color: 'var(--alloy-pink)', fontSize: 13 }}>Couldn’t load this ticket. {error}</div>;
  }
  if (!data || !data.ticket) {
    return <div style={{ padding: '40px 22px', color: 'var(--fg-muted)', fontSize: 13 }}>This ticket isn’t available.</div>;
  }

  const t = data.ticket;
  const ccs = data.ccs || [];

  return (
    <>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>#{t.id}</span>
            <span className="tag tag-outline" style={{ textTransform: 'capitalize' }}>{t.status}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--alloy-purple)' }}>{t.title}</div>
          {/* Requester — so the team knows whose ticket this is */}
          {t.requester ? (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
              From <strong style={{ color: 'var(--fg-3)' }}>{t.requester}</strong>
              {t.requesterEmail ? <span> · {t.requesterEmail}</span> : null}
            </div>
          ) : null}
        </div>
        {!['solved', 'closed'].includes(t.status) ? (
          <button className="btn btn-secondary btn-sm" onClick={resolve} disabled={resolving} style={{ flexShrink: 0 }}>
            {resolving ? 'Resolving…' : 'Mark resolved'}
          </button>
        ) : null}
      </div>

      {/* CC row — current collaborators + add a CC */}
      <div style={{ padding: '8px 22px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--alloy-off-white)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>CC</span>
        {ccs.length ? ccs.map((c, i) => (
          <span key={i} title={c.email || c.name} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)' }}>
            {c.name}
          </span>
        )) : <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No one CC’d yet</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <input
            className="input" value={newCc} onChange={(e) => setNewCc(e.target.value)}
            placeholder="email to CC" disabled={addingCc}
            onKeyDown={(e) => { if (e.key === 'Enter') addCc(); }}
            style={{ fontSize: 12, padding: '5px 9px', width: 200 }}
          />
          <button className="btn btn-sm btn-secondary" onClick={addCc} disabled={addingCc || !newCc.trim()}>
            {addingCc ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <div style={{ padding: '22px', flex: 1, overflowY: 'auto', background: 'var(--alloy-off-white)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.messages.length === 0 ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 13, alignSelf: 'center' }}>No messages yet.</div>
        ) : data.messages.map((m) => <Bubble key={m.id} m={m} />)}
      </div>

      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: '#fff' }}>
        {/* Staged attachment chips */}
        {files.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {files.map((f, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '4px 8px', background: 'var(--alloy-off-white)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--fg-3)' }}>
                <I.Paperclip width={12} height={12} /> {f.name}
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-muted)', fontWeight: 700, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        ) : null}
        {/* CC for this reply (optional) */}
        <input
          className="input" value={cc} onChange={(e) => setCc(e.target.value)}
          placeholder="CC on this reply (comma-separated emails) — optional"
          style={{ fontSize: 12, padding: '6px 10px', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            className="input" rows={2} placeholder="Reply to your team…"
            style={{ resize: 'none', minHeight: 60 }}
            value={reply} onChange={(e) => setReply(e.target.value)} disabled={sending}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', flexShrink: 0 }}>
            <input
              ref={fileInput} type="file" multiple style={{ display: 'none' }}
              onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])]); e.target.value = ''; }}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => fileInput.current && fileInput.current.click()} disabled={sending} title="Attach files">
              <I.Paperclip width={13} height={13} /> Attach
            </button>
            {isStaff ? (
              <select
                className="input" value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)}
                title="Ticket status after sending" style={{ padding: '6px 8px', fontSize: 12 }}
              >
                <option value="open">Keep open</option>
                <option value="pending">Set pending</option>
                <option value="solved">Mark solved</option>
              </select>
            ) : null}
            <button className="btn btn-primary" onClick={send} disabled={sending || (!reply.trim() && files.length === 0)}>
              <I.Send width={13} height={13} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default TicketThread;
