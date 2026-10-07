import React from 'react';
import AdminIntakeRounds, { SubmissionRow } from './AdminIntakeRounds.jsx';
import {
  listNewsletterRequests, openNewsletterRound, closeNewsletterRequest, deleteNewsletterRequest, intakePrep,
} from '../lib/admin.js';
import { TICKET_DEFAULTS } from '../lib/intakeTicket.js';

// Admin → Newsletter Room. Open a content round for a set of clients, track
// who opened / submitted, read what they sent. The tracker itself is
// AdminIntakeRounds (shared with Quarterly Meetings); this file is the
// newsletter's copy, API and submission layout.

const API = {
  list: listNewsletterRequests,
  open: openNewsletterRound,
  close: closeNewsletterRequest,
  remove: deleteNewsletterRequest,
  prep: intakePrep,
};

function defaultTitle() {
  try {
    return `${new Date().toLocaleDateString(undefined, { month: 'long' })} Newsletter`;
  } catch { return 'Newsletter'; }
}

const COPY = {
  noun: 'newsletter',
  openTitle: 'Open a newsletter round',
  openHelp: 'Pick who sees the intake form this round. Each selected client gets a banner until they submit.',
  titlePlaceholder: 'August 2026 Newsletter',
  defaultTitle,
  fallbackTitle: 'Newsletter',
  deleteConfirm: 'Delete this newsletter request? This removes it and any recorded submission.',
  empty: 'No newsletter rounds yet. Open one on the left to get started.',
  submittedLabel: 'Submitted — ready to build',
  ticket: TICKET_DEFAULTS.newsletter,
};

// Submitted answers, rendered read-only for staff.
function Submission({ sub }) {
  if (!sub) return null;
  const links = (sub.links || []).filter((l) => l && l.url);
  const atts = sub.attachments || [];
  return (
    <div style={{ background: 'var(--alloy-off-white)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
      <SubmissionRow label="This past month" value={sub.highlights} />
      <SubmissionRow label="Coming months" value={sub.focus} />
      <SubmissionRow label="Events" value={sub.events} />
      <SubmissionRow label="New to the team" value={sub.people} />
      <SubmissionRow label="Excited about" value={sub.excited} />
      {/* Retired from the form in Sept 2026. Kept so earlier submissions still
          render in full; SubmissionRow returns null when empty, so newer ones
          show nothing here rather than two blank labels. */}
      <SubmissionRow label="To feature" value={sub.feature} />
      <SubmissionRow label="Call to action" value={sub.cta} />
      {links.length ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-muted)', marginBottom: 2 }}>Links</div>
          {links.map((l, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--alloy-purple)' }}>{l.label ? `${l.label} — ` : ''}{l.url}</a>
            </div>
          ))}
        </div>
      ) : null}
      {atts.length ? <SubmissionRow label="Attachments" value={atts.join(', ')} /> : null}
      <SubmissionRow label="Anything else" value={sub.notes} />
    </div>
  );
}

export default function AdminNewsletter() {
  return <AdminIntakeRounds api={API} copy={COPY} renderSubmission={(sub) => <Submission sub={sub} />} />;
}
