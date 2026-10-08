import React from 'react';
import { I } from './icons.jsx';
import { submitQuarterly, hasQuarterlyAnswer, openQuarterlyBooking, formatMeetingAt, QUARTERLY_CHANGED } from '../lib/quarterly.js';
import { DATA } from '../data.js';

const { useState, useEffect, useRef } = React;

// Quarterly meeting prep form — the quarterly twin of NewsletterModal. Opened
// from the "Open Form" button on a `quarterly`-tagged ticket while the account
// has an open round. Five short prompts about last quarter + what's ahead;
// nothing individually required — one answer anywhere is a valid submission.
// On submit it creates a Zendesk ticket (like a New Request) AND stamps the
// account's open quarterly round as submitted, which clears the button. The
// success step then offers "Schedule the meeting" (Cal.com dialog); "Done"
// takes them to the ticket.
export default function QuarterlyModal({ request, onClose, onSubmitted }) {
  const [form, setForm] = useState({ wins: '', misses: '', changes: '', priorities: '', topics: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null); // { ticketId } once sent
  // Re-render when the round changes under us (the client books inside Cal's dialog).
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(QUARTERLY_CHANGED, bump);
    return () => window.removeEventListener(QUARTERLY_CHANGED, bump);
  }, []);
  const live = DATA.quarterlyRequest && request && DATA.quarterlyRequest.id === request.id ? DATA.quarterlyRequest : request;
  const bookedAt = live && live.meetingAt ? formatMeetingAt(live.meetingAt) : '';
  const fileRef = useRef(null);

  const title = (request && request.title) || 'Quarterly Meeting';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // After a successful send, closing = finishing (navigates to the ticket).
  const finish = () => (done ? onSubmitted(done.ticketId) : onClose());

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles((f) => [...f, ...picked]);
    e.target.value = '';
  };
  const removeFile = (i) => setFiles((f) => f.filter((_, k) => k !== i));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) finish(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, done, onClose, onSubmitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    // Same rule as the newsletter: no single field is required. Someone with
    // nothing to flag from last quarter but one topic for the meeting should be
    // able to send just that.
    if (!hasQuarterlyAnswer(form)) { setErr('Add at least one thing and we’ll take it from there.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await submitQuarterly(request && request.id, form, files);
      setBusy(false);
      setDone({ ticketId: (res && res.ticketId) || null });
    } catch (e) {
      setBusy(false);
      setErr(String((e && e.message) || e || 'Something went wrong.'));
    }
  };

  return (
    <div className="nr-scrim" onClick={() => !busy && finish()}>
      <div className="nr-modal" role="dialog" aria-modal="true" aria-label="Quarterly meeting prep"
        onClick={(e) => e.stopPropagation()} style={{ width: 540, maxHeight: '88vh', overflowY: 'auto' }}>
        {done ? (
          <>
            <div className="nr-head">
              <div>
                <div className="nr-kicker">Quarterly meeting</div>
                <div className="nr-title">Thank you — we’ve got it.</div>
              </div>
              <button className="nr-close" onClick={finish} aria-label="Close"><I.Close width={14} height={14} /></button>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 2px' }}>
              Your answers are on their way to your Alloy team — we’ll use them to come prepared.
            </p>
            {/* The meeting itself: Cal.com's dialog, prefilled with who they are.
                A separate step from the form so a client can send the prep now
                and book later from the ticket. */}
            <div data-testid="quarterly-schedule" style={{ background: 'var(--alloy-purple-tint)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              {bookedAt ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--alloy-purple)' }}><I.Check width={14} height={14} /> Meeting booked · {bookedAt}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 }}>It’s on the calendar — you’ll get Cal’s confirmation by email. See you then.</div>
                </div>
              ) : (<>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--alloy-purple)' }}>One more thing: pick a time for your {title}.</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 }}>Choose a slot that works for you — it takes a minute, and you can always do it later from this ticket.</div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => openQuarterlyBooking(request)}
                style={{ fontSize: 13.5, fontWeight: 800, padding: '10px 16px', gap: 8, flexShrink: 0 }}>
                <I.Calendar width={14} height={14} /> Schedule the meeting
              </button>
              </>)}
            </div>
            <div className="nr-foot">
              <button className="btn btn-secondary" onClick={finish}>Done</button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
