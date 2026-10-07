import React from 'react';
import { I } from './icons.jsx';
import { submitQuarterly, hasQuarterlyAnswer } from '../lib/quarterly.js';

const { useState, useEffect, useRef } = React;

// Quarterly meeting prep form — the quarterly twin of NewsletterModal. Opened
// from the "Open Form" button on a `quarterly`-tagged ticket while the account
// has an open round. Five short prompts about last quarter + what's ahead;
// nothing individually required — one answer anywhere is a valid submission.
// On submit it creates a Zendesk ticket (like a New Request) AND stamps the
// account's open quarterly round as submitted, which clears the button.
export default function QuarterlyModal({ request, onClose, onSubmitted }) {
  const [form, setForm] = useState({ wins: '', misses: '', changes: '', priorities: '', topics: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const title = (request && request.title) || 'Quarterly Meeting';
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
    // Same rule as the newsletter: no single field is required. Someone with
    // nothing to flag from last quarter but one topic for the meeting should be
    // able to send just that.
    if (!hasQuarterlyAnswer(form)) { setErr('Add at least one thing and we’ll take it from there.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await submitQuarterly(request && request.id, form, files);
      setBusy(false);
      onSubmitted(res && res.ticketId);
    } catch (e) {
      setBusy(false);
      setErr(String((e && e.message) || e || 'Something went wrong.'));
    }
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && onClose()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="Quarterly meeting prep"
        onClick={(e) => e.stopPropagation()} style={{ width: 540, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="nr-head">
          <div>
            <div className="nr-kicker">Quarterly meeting</div>
            <div className="nr-title">{title}</div>
          </div>
          <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
        </div>

        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 2px' }}>
          Before we meet, five quick questions about last quarter and what’s ahead — answer whichever you have something for and skip the rest. One sentence each is plenty.
        </p>

        {/* Five prompts, conversational and singular, in the same spirit as the
            newsletter's: a category is far easier to answer than a blank brief.
            The first three look back (wins, misses, what changed), the last two
            look ahead (priorities, what to cover). Nothing is individually
            required (see submit). */}
        <label className="nr-field">
          <span className="nr-label">What went well last quarter?</span>
          <textarea className="input" rows={3} value={form.wins} onChange={set('wins')} autoFocus
            placeholder="A win, a milestone, a number you’re proud of — one thing is plenty." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">What didn’t go the way you hoped?</span>
          <textarea className="input" rows={3} value={form.misses} onChange={set('misses')}
            placeholder="Something that stalled, underperformed, or took longer than it should have." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Anything changed in the business?</span>
          <textarea className="input" rows={2} value={form.changes} onChange={set('changes')}
            placeholder="New hires or departures, new services or markets, pricing, who you’re trying to reach." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">What matters most next quarter?</span>
          <textarea className="input" rows={3} value={form.priorities} onChange={set('priorities')}
            placeholder="Top goals, a launch, a market to grow, a number to hit." style={{ resize: 'vertical' }} />
        </label>

        <label className="nr-field">
          <span className="nr-label">Anything you want to make sure we cover when we meet?</span>
          <textarea className="input" rows={2} value={form.topics} onChange={set('topics')}
            placeholder="Questions, concerns, ideas — anything on your mind." style={{ resize: 'vertical' }} />
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
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit meeting prep'}</button>
        </div>
      </div>
    </div>
  );
}
