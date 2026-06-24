import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { zdCreate, zdUpload } from '../lib/zendesk.js';

const { useState, useEffect, useRef } = React;

// Request types. "website" is the primary one — it routes to the client's
// Pastel feedback board (visual point-and-comment) instead of a text ticket,
// when a Pastel URL is configured for the account.
const TYPES = [
  { v: 'website', label: 'Website update / change' },
  { v: 'marketing', label: 'Marketing / content' },
  { v: 'seo', label: 'SEO / Google listing' },
  { v: 'design', label: 'Design / creative asset' },
  { v: 'billing', label: 'Billing / account' },
  { v: 'other', label: 'Something else' },
];

// Compose + send a new support request (creates a Zendesk ticket on the
// account's org as the signed-in user). Flow: intent gate (new vs. already
// open) → for new, pick a type → website routes to Pastel, everything else
// opens the ticket form. "Already open" sends them to the Playbook.
export default function NewRequestModal({ onClose, onCreated, onNav }) {
  const [mode, setMode] = useState('intent'); // intent | new | open
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const pastelUrl = DATA.account && DATA.account.pastelUrl;
  const typeLabel = (TYPES.find((t) => t.v === type) || {}).label || '';
  const showPastel = mode === 'new' && type === 'website' && !!pastelUrl;
  const showForm = mode === 'new' && !!type && !showPastel;

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles((f) => [...f, ...picked]);
    e.target.value = '';
  };
  const removeFile = (i) => setFiles((f) => f.filter((_, k) => k !== i));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const goPlaybook = () => { if (onNav) onNav('projects'); onClose(); };

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Add a subject and a few details.'); return; }
    setBusy(true); setErr('');
    try {
      let uploads = [];
      if (files.length) uploads = (await Promise.all(files.map((f) => zdUpload(f)))).filter(Boolean);
      const body = typeLabel ? `Request type: ${typeLabel}\n\n${message.trim()}` : message.trim();
      const res = await zdCreate({ subject: subject.trim(), body, priority, uploads });
      setBusy(false);
      if (res && res.id) onCreated(res.id); else onClose();
    } catch (e) { setBusy(false); setErr(String((e && e.message) || e || 'Something went wrong.')); }
  };

  const title = mode === 'open' ? 'Already in progress' : mode === 'new' ? 'New request' : 'How can we help?';
  const choiceStyle = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border-subtle, #e8e4ef)',
    background: '#fff', cursor: 'pointer', marginBottom: 10,
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && onClose()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="New request" onClick={(e) => e.stopPropagation()}>
        <div className="nr-head">
          <div>
            <div className="nr-kicker">Request</div>
            <div className="nr-title">{title}</div>
          </div>
          <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
        </div>

        {/* Step 1 — intent gate */}
        {mode === 'intent' ? (
          <div>
            <p className="nr-label" style={{ marginBottom: 14 }}>Is this something new, or about a request that's already underway?</p>
            <button type="button" style={choiceStyle} onClick={() => setMode('new')}>
              <I.Plus width={18} height={18} />
              <span>
                <span style={{ display: 'block', fontWeight: 700, color: 'var(--alloy-purple)' }}>Start a new request</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--fg-muted)' }}>A website change, a question, something to kick off.</span>
              </span>
            </button>
            <button type="button" style={choiceStyle} onClick={() => setMode('open')}>
              <I.Ticket width={18} height={18} />
              <span>
                <span style={{ display: 'block', fontWeight: 700, color: 'var(--alloy-purple)' }}>Check on something open</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--fg-muted)' }}>See status or reply to a request in progress.</span>
              </span>
            </button>
          </div>
        ) : null}

        {/* Already open → point to the Playbook */}
        {mode === 'open' ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)', margin: '0 0 18px' }}>
              Everything already in motion lives on your <strong>Playbook</strong> — open requests, their status, and replies are all there.
            </p>
            <div className="nr-foot">
              <button className="btn btn-secondary" onClick={() => setMode('intent')}>← Back</button>
              <button className="btn btn-primary" onClick={goPlaybook}>Go to my Playbook <I.Arrow width={14} height={14} /></button>
            </div>
          </div>
        ) : null}

        {/* New request → type, then form or Pastel */}
        {mode === 'new' ? (
          <>
            <label className="nr-field">
              <span className="nr-label">What kind of request is this?</span>
              <select className="input" value={type} onChange={(e) => { setType(e.target.value); setErr(''); }} autoFocus>
                <option value="">Select a type…</option>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </label>

            {showPastel ? (
              <div style={{ padding: '4px 0 8px' }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)', margin: '0 0 16px' }}>
                  Website changes are easiest on your <strong>feedback board</strong> — click anywhere on your live site to point, comment, and request edits, and we'll see them right away.
                </p>
                <a className="btn btn-primary" href={pastelUrl} target="_blank" rel="noopener noreferrer" onClick={onClose} style={{ textDecoration: 'none' }}>
                  Open your website feedback board <I.External width={13} height={13} />
                </a>
              </div>
            ) : null}

            {showForm ? (
              <>
                {type === 'website' ? (
                  <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '-4px 0 12px' }}>Describe the website change and we'll take it from there.</p>
                ) : null}
                <label className="nr-field">
                  <span className="nr-label">Subject</span>
                  <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of what you need" />
                </label>
                <label className="nr-field">
                  <span className="nr-label">Details</span>
                  <textarea className="input" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's going on — as much or as little as you'd like." style={{ resize: 'vertical' }} />
                </label>
                <label className="nr-field">
                  <span className="nr-label">Priority</span>
                  <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <div className="nr-field">
                  <span className="nr-label">Attachments</span>
                  <div className="nr-files">
                    {files.map((f, i) => (
                      <span key={i} className="nr-file" title={f.name}>
                        <I.Paperclip width={12} height={12} />
                        <span className="nr-file-name">{f.name}</span>
                        <button type="button" className="nr-file-x" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}><I.Close width={10} height={10} /></button>
                      </span>
                    ))}
                    <button type="button" className="nr-attach" onClick={() => fileRef.current && fileRef.current.click()}>
                      <I.Paperclip width={13} height={13} /> Attach files
                    </button>
                    <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={addFiles} />
                  </div>
                </div>
              </>
            ) : null}

            {err ? <div className="nr-err">{err}</div> : null}
            <div className="nr-foot">
              <button className="btn btn-secondary" onClick={() => { setMode('intent'); setType(''); setErr(''); }} disabled={busy}>← Back</button>
              {showForm ? (
                <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
