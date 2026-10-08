import React from 'react';
import { I } from './icons.jsx';
import { quarterlyBookingForTicketTags, openQuarterlyBooking } from '../lib/quarterly.js';

// "Schedule the meeting" on a `quarterly`-tagged ticket, shown only while the
// account's round is SUBMITTED (the prep is in; the meeting isn't booked by
// us). Self-contained — it reads the loaded round itself and opens Cal.com's
// dialog directly, so the ticket surfaces don't need another prop threaded
// through App.jsx. `variant`: 'thread' (ticket action bar) | 'card' (Playbook).
export default function QuarterlyBookButton({ tags, variant = 'thread' }) {
  const req = quarterlyBookingForTicketTags(tags);
  if (!req) return null;
  const onClick = () => openQuarterlyBooking(req);
  if (variant === 'card') {
    return (
      <button type="button" className="pj-btn-primary" onClick={onClick}>
        <I.Calendar width={13} height={13} /> Schedule meeting
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-primary" onClick={onClick}
      style={{ fontSize: 14, fontWeight: 800, padding: '11px 20px', gap: 8 }}>
      <I.Calendar width={15} height={15} /> Schedule the meeting
    </button>
  );
}
