import React from 'react';
import { I } from './icons.jsx';
import { zdCreate, zdUpload } from '../lib/zendesk.js';

const { useState, useEffect, useRef } = React;

// Compose + send a new support request (creates a Zendesk ticket on the
// account's org as the signed-in user). Opens from the "New request" buttons.
export default function NewRequestModal({ onClose, onCreated }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles((f) => [...f, ...picked]);
    e.target.value = ''; // allow re-picking the same file
  };
  const removeFile = (i) => setFiles((f) => f.filter((_, k) => k !== i));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Add a subject and a few details.'); return; }
    setBusy(true); setErr('');
    try {
      let uploads = [];
      if (files.length) {
        uploads = (await Promise.all(files.map((f) => zdUpload(f)))).filter(Boolean);
      }
      const res = await zdCreate({ subject: subject.trim(), body: message.trim(), priority, uploads });
      setBusy(false);
      if (res && res.id) onCreated(res.id);
      else onClose();
    } catch (e) { setBusy(false); setErr(String((e && e.message) || e || 'Something went wrong.')); }
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && onClose()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="New request" onClick={(e) => e.stopPropagation()}>
        <div className="nr-head">
          <div>
            <div className="nr-kicker">New request</div>
            <div className="nr-title">How can we help?</div>
          </div>
          <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
        </div>
        <label className="nr-field">
          <span className="nr-label">Subject</span>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of what you need" autoFocus />
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
                <button type="button" className="nr-file-x" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}>
                  <I.Close width={10} height={10} />
                </button>
              </span>
            ))}
            <button type="button" className="nr-attach" onClick={() => fileRef.current && fileRef.current.click()}>
              <I.Paperclip width={13} height={13} /> Attach files
            </button>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={addFiles} />
          </div>
        </div>
        {err ? <div className="nr-err">{err}</div> : null}
        <div className="nr-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </div>
    </div>
  );
}
