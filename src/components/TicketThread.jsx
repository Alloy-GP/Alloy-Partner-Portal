import React from 'react';
import { I } from './icons.jsx';
import { zdThread, zdReply } from '../lib/zendesk.js';

const { useState, useEffect } = React;

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

function Bubble({ m }) {
  const mine = m.mine;
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
        <div style={{ padding: '12px 14px', background: mine ? 'var(--alloy-purple)' : '#fff', color: mine ? '#fff' : 'var(--fg-3)', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5, border: mine ? 'none' : '1px solid var(--border-subtle)', whiteSpace: 'pre-wrap' }}>
          {m.body}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders one Zendesk ticket's public conversation, with a reply box.
 * `id` is the Zendesk ticket id. Re-fetches whenever the id changes.
 */
function TicketThread({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

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

  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const send = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    try {
      await zdReply(id, text);
      setReply('');
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSending(false);
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

  return (
    <>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>#{data.ticket.id}</span>
          <span className="tag tag-outline" style={{ textTransform: 'capitalize' }}>{data.ticket.status}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--alloy-purple)' }}>{data.ticket.title}</div>
      </div>

      <div style={{ padding: '22px', flex: 1, overflowY: 'auto', background: 'var(--alloy-off-white)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.messages.length === 0 ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 13, alignSelf: 'center' }}>No messages yet.</div>
        ) : data.messages.map((m) => <Bubble key={m.id} m={m} />)}
      </div>

      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: '#fff' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            className="input" rows={2} placeholder="Reply to your team…"
            style={{ resize: 'none', minHeight: 60 }}
            value={reply} onChange={(e) => setReply(e.target.value)} disabled={sending}
          />
          <button className="btn btn-primary" onClick={send} disabled={sending || !reply.trim()}>
            <I.Send width={13} height={13} /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}

export default TicketThread;
