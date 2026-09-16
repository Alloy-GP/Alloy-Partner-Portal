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
  const [form, setForm] = useState({ highlights: '', focus: '', events: '', people: '', excited: '' });
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    // No single field is required — the point is that one sentence anywhere is a
    // valid submission. Requiring the first question would force someone with
    // nothing from last month but an event coming up to leave it blank or invent
    // something, which is exactly the pause this rewrite is trying to remove.
    const answered = ['highlights', 'focus', 'events', 'people', 'excited'].some((k) => (form[k] || '').trim());
    if (!answered) { setErr('Add at least one thing and we’ll take it from there.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await submitNewsletter(request && request.id, form, files);
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
          Five quick questions — answer whichever you have something for and skip the rest. One sentence each is plenty.
        </p>

        {/* Five prompts, deliberately conversational and deliberately SINGULAR:
            "something worth mentioning" asks for one thing, where the previous
            "what should we cover" read as a request for a report. The specific
            ones (events, new people, excited about) are recall triggers — people
            answer a category far more easily than a blank brief.

            "this past month" rather than a fixed window: most clients are monthly
            but some are quarterly, and the ticket copy can say so for those.

            Nothing here is individually required (see submit): one answer anywhere
            is a complete submission. */}
        <label className="nr-field">
          <span className="nr-label">What’s something worth mentioning that happened this past month?</span>
          <textarea className="input" rows={3} value={form.highlights} onChange={set('highlights')} autoFocus
            placeholder="A new community, a project wrapped, an award, a milestone — one thing is plenty." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">What’s something worth mentioning in the coming months?</span>
          <textarea className="input" rows={3} value={form.focus} onChange={set('focus')}
            placeholder="Budget season, hurricane prep, insurance renewals — anything board members should have on their radar." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Any events happening?</span>
          <textarea className="input" rows={2} value={form.events} onChange={set('events')}
            placeholder="Webinars, annual meetings, office closures or holiday hours — with dates if you have them." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Anybody new joining the team?</span>
          <textarea className="input" rows={2} value={form.people} onChange={set('people')}
            placeholder="New hires, promotions, someone stepping into a new role." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Anything you’re excited about?</span>
          <textarea className="input" rows={2} value={form.excited} onChange={set('excited')}
            placeholder="Doesn’t have to be polished — if it’s got you fired up, your boards will probably feel the same." style={{ resize: 'vertical' }} />
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

        {err ? <div className="nr-err">{err}</div> : null}
        <div className="nr-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit newsletter content'}</button>
        </div>
      </div>
    </div>
  );
}
