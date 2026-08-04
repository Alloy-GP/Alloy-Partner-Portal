import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { submitNewsletter } from '../lib/newsletter.js';

const { useState, useEffect, useRef } = React;

// Newsletter intake form. Opened from the portal-wide banner. Light on purpose —
// only "what's happening" is required; everything else is optional. On submit it
// creates a Zendesk ticket (like a New Request) AND stamps the account's open
// newsletter round as submitted, which clears the banner.
export default function NewsletterModal({ request, onClose, onSubmitted }) {
  const [form, setForm] = useState({ highlights: '', feature: '', cta: '', notes: '' });
  const [links, setLinks] = useState([{ label: '', url: '' }]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const title = (request && request.title) || 'Newsletter';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles((f) => [...f, ...picked]);
    e.target.value = '';
  };
  const removeFile = (i) => setFiles((f) => f.filter((_, k) => k !== i));

  const setLink = (i, key) => (e) =>
    setLinks((ls) => ls.map((l, k) => (k === i ? { ...l, [key]: e.target.value } : l)));
  const addLink = () => setLinks((ls) => [...ls, { label: '', url: '' }]);
  const removeLink = (i) => setLinks((ls) => (ls.length <= 1 ? ls : ls.filter((_, k) => k !== i)));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!form.highlights.trim()) { setErr('Tell us at least a line about what’s happening this month.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await submitNewsletter(request && request.id, { ...form, links }, files);
      setBusy(false);
      onSubmitted(res && res.ticketId);
    } catch (e) {
      setBusy(false);
      setErr(String((e && e.message) || e || 'Something went wrong.'));
    }
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && onClose()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="Newsletter content"
        onClick={(e) => e.stopPropagation()} style={{ width: 540, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="nr-head">
          <div>
            <div className="nr-kicker">Newsletter</div>
            <div className="nr-title">{title}</div>
          </div>
          <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
        </div>

        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 2px' }}>
          A quick brain-dump is all we need — tell us what’s going on and what you’d like to feature, and we’ll shape it into your newsletter.
        </p>

        <label className="nr-field">
          <span className="nr-label">What’s happening this month? *</span>
          <textarea className="input" rows={4} value={form.highlights} onChange={set('highlights')} autoFocus
            placeholder="News, updates, events, milestones — as much or as little as you like." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Anything to feature or spotlight?</span>
          <textarea className="input" rows={3} value={form.feature} onChange={set('feature')}
            placeholder="A promotion, a new hire, a case study, an event…" style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Call to action</span>
          <input className="input" value={form.cta} onChange={set('cta')}
            placeholder="What should readers do? (book a call, visit a page, RSVP…)" />
        </label>

        <div className="nr-field">
          <span className="nr-label">Links</span>
          {links.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input className="input" value={l.label} onChange={setLink(i, 'label')} placeholder="Label (optional)" style={{ flex: '0 0 34%' }} />
              <input className="input" value={l.url} onChange={setLink(i, 'url')} placeholder="https://…" style={{ flex: 1 }} />
              <button type="button" className="nr-file-x" onClick={() => removeLink(i)} aria-label="Remove link"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
                <I.Close width={12} height={12} />
              </button>
            </div>
          ))}
          <button type="button" className="nr-attach" onClick={addLink} style={{ alignSelf: 'flex-start' }}>+ Add another link</button>
        </div>

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

        <label className="nr-field">
          <span className="nr-label">Anything else?</span>
          <textarea className="input" rows={2} value={form.notes} onChange={set('notes')}
            placeholder="Tone, timing, must-includes — anything on your mind." style={{ resize: 'vertical' }} />
        </label>

        {err ? <div className="nr-err">{err}</div> : null}
        <div className="nr-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit newsletter content'}</button>
        </div>
      </div>
    </div>
  );
}
