import React from 'react';
import AdminIntakeRounds, { SubmissionRow } from './AdminIntakeRounds.jsx';
import {
  listQuarterlyRequests, openQuarterlyRound, closeQuarterlyRequest, deleteQuarterlyRequest,
} from '../lib/admin.js';
import { QUARTERLY_SECTIONS, defaultQuarterlyTitle } from '../lib/quarterly.js';

// Admin → Quarterly Meetings. Open a prep round for the clients you're about to
// meet with, watch who has opened / filled out the form, and read the answers
// before the meeting. Same tracker as the Newsletter Room (AdminIntakeRounds),
// pointed at `quarterly_requests`.

const API = {
  list: listQuarterlyRequests,
  open: openQuarterlyRound,
  close: closeQuarterlyRequest,
  remove: deleteQuarterlyRequest,
};

const COPY = {
  noun: 'quarterly',
  openTitle: 'Open a quarterly meeting round',
  openHelp: 'Pick who you’re meeting with this quarter. Each selected client sees “Open Form” on their quarterly-tagged ticket until they submit.',
  titlePlaceholder: 'Q4 2026 Quarterly Meeting',
  defaultTitle: () => defaultQuarterlyTitle(),
  fallbackTitle: 'Quarterly Meeting',
  deleteConfirm: 'Delete this quarterly meeting request? This removes it and any recorded submission.',
  empty: 'No quarterly meeting rounds yet. Open one on the left before your next round of planning meetings.',
  submittedLabel: 'Submitted — ready for the meeting',
};

// Submitted answers, rendered read-only for staff. Same order as the form.
function Submission({ sub }) {
  if (!sub) return null;
  const atts = sub.attachments || [];
  return (
    <div style={{ background: 'var(--alloy-off-white)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
      {QUARTERLY_SECTIONS.map(([key, label]) => <SubmissionRow key={key} label={label} value={sub[key]} />)}
      {atts.length ? <SubmissionRow label="Attachments" value={atts.join(', ')} /> : null}
    </div>
  );
}

export default function AdminQuarterly() {
  return <AdminIntakeRounds api={API} copy={COPY} renderSubmission={(sub) => <Submission sub={sub} />} />;
}
