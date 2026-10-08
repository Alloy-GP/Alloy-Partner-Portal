import React from 'react';
import { I } from './icons.jsx';
import {
  quarterlyBookingForTicketTags, quarterlyMeetingForTicketTags, openQuarterlyBooking, formatMeetingAt, QUARTERLY_CHANGED,
} from '../lib/quarterly.js';

const { useState, useEffect } = React;

// "Schedule the meeting" on a `quarterly`-tagged ticket, shown only while the
// account's round is SUBMITTED and the meeting isn't booked yet; once the
// client books inside Cal's dialog it becomes "Meeting booked · <date>".
// Self-contained — it reads the loaded round itself, listens for the round
// changing (the booking lands while this is on screen) and opens Cal.com
// directly, so the ticket surfaces don't need another prop threaded through
// App.jsx. `variant`: 'thread' (ticket action bar) | 'card' (Playbook).
export default function QuarterlyBookButton({ tags, variant = 'thread' }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(QUARTERLY_CHANGED, bump);
    return () => window.removeEventListener(QUARTERLY_CHANGED, bump);
  }, []);

  const booked = quarterlyMeetingForTicketTags(tags);
  if (booked) {
    const when = formatMeetingAt(booked.meetingAt);
    const style = variant === 'card'
      ? { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 8, background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 11.5, fontWeight: 700 }
      : { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 10, background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 14, fontWeight: 800 };
    return <span data-testid="quarterly-booked" style={style}><I.Check width={13} height={13} /> Meeting booked{when ? ` · ${when}` : ''}</span>;
  }

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
