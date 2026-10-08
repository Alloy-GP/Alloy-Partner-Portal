import { describe, it, expect, afterEach } from 'vitest';
import { DATA } from '../data.js';
import {
  quarterlyForTicketTags, quarterlyBookingForTicketTags, quarterlyMeetingForTicketTags, quarterlyBookingConfig, CAL_QUARTERLY,
  parseCalBooking, recordQuarterlyBooking, formatMeetingAt,
  quarterLabel, defaultQuarterlyTitle, hasQuarterlyAnswer, buildQuarterlyBody, QUARTERLY_SECTIONS,
} from './quarterly.js';

const openReq = { id: 'r1', title: 'Q4 2026 Quarterly Meeting', status: 'open' };

describe('quarterlyForTicketTags', () => {
  it('returns the open round for a quarterly-tagged ticket', () => {
    expect(quarterlyForTicketTags(['quarterly'], openReq)).toBe(openReq);
    expect(quarterlyForTicketTags(['video', 'quarterly_meeting'], openReq)).toBe(openReq);
    expect(quarterlyForTicketTags(['Quarterly-Meeting'], openReq)).toBe(openReq);
  });
  it('is null without the tag, with no tags, or with no open round', () => {
    expect(quarterlyForTicketTags(['newsletter'], openReq)).toBeNull();
    expect(quarterlyForTicketTags([], openReq)).toBeNull();
    expect(quarterlyForTicketTags(null, openReq)).toBeNull();
    expect(quarterlyForTicketTags(['quarterly'], null)).toBeNull();
    expect(quarterlyForTicketTags(['quarterly'], { ...openReq, status: 'submitted' })).toBeNull();
    expect(quarterlyForTicketTags(['quarterly'], { ...openReq, status: 'closed' })).toBeNull();
  });
  it('does not match the goals tag (that is the separate email-only form)', () => {
    expect(quarterlyForTicketTags(['goals'], openReq)).toBeNull();
  });
});

describe('quarterLabel / defaultQuarterlyTitle', () => {
  it('labels the calendar quarter of the given date', () => {
    expect(quarterLabel(new Date('2026-01-15T00:00:00'))).toBe('Q1 2026');
    expect(quarterLabel(new Date('2026-04-01T00:00:00'))).toBe('Q2 2026');
    expect(quarterLabel(new Date('2026-10-07T00:00:00'))).toBe('Q4 2026');
    expect(quarterLabel(new Date('2026-12-31T00:00:00'))).toBe('Q4 2026');
  });
  it('builds the default round title from it', () => {
    expect(defaultQuarterlyTitle(new Date('2026-10-07T00:00:00'))).toBe('Q4 2026 Quarterly Meeting');
  });
});

describe('hasQuarterlyAnswer', () => {
  it('is true when any one prompt is answered', () => {
    expect(hasQuarterlyAnswer({ topics: 'Budget for next year' })).toBe(true);
    expect(hasQuarterlyAnswer({ wins: '  ', priorities: 'Grow leads' })).toBe(true);
  });
  it('is false when every prompt is blank or missing', () => {
    expect(hasQuarterlyAnswer({})).toBe(false);
    expect(hasQuarterlyAnswer({ wins: '', misses: '   ' })).toBe(false);
    expect(hasQuarterlyAnswer(null)).toBe(false);
  });
});

describe('buildQuarterlyBody', () => {
  it('leads with the round title and only includes answered sections', () => {
    const body = buildQuarterlyBody({ wins: 'Closed 3 new boards', topics: ' Pricing ' }, 'Q4 2026 Quarterly Meeting');
    expect(body.startsWith('Quarterly meeting prep — Q4 2026 Quarterly Meeting')).toBe(true);
    expect(body).toContain('Went well last quarter:\nClosed 3 new boards');
    expect(body).toContain('Topics for the meeting:\nPricing');
    expect(body).not.toContain('Didn’t go as planned');
    expect(body).not.toContain('Changes in the business');
    expect(body).not.toContain('Priorities for next quarter');
    expect(body.endsWith('\n')).toBe(false);
  });
  it('keeps the sections in form order', () => {
    const form = Object.fromEntries(QUARTERLY_SECTIONS.map(([k]) => [k, `answer ${k}`]));
    const body = buildQuarterlyBody(form, 'T');
    const idx = QUARTERLY_SECTIONS.map(([, heading]) => body.indexOf(heading));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe('quarterlyBookingForTicketTags (the other half of the lifecycle)', () => {
  const submitted = { ...openReq, status: 'submitted' };
  it('returns the round only while it is submitted, on a quarterly-tagged ticket', () => {
    expect(quarterlyBookingForTicketTags(['quarterly'], submitted)).toBe(submitted);
    expect(quarterlyBookingForTicketTags(['Quarterly_Meeting'], submitted)).toBe(submitted);
    expect(quarterlyBookingForTicketTags(['newsletter'], submitted)).toBeNull();
    expect(quarterlyBookingForTicketTags(['quarterly'], openReq)).toBeNull();          // form, not booking
    expect(quarterlyBookingForTicketTags(['quarterly'], { ...openReq, status: 'closed' })).toBeNull();
    expect(quarterlyBookingForTicketTags(['quarterly'], null)).toBeNull();
  });
  it('never offers both the form and the booking for one round', () => {
    for (const status of ['open', 'submitted', 'closed']) {
      const req = { ...openReq, status };
      expect(!!quarterlyForTicketTags(['quarterly'], req) && !!quarterlyBookingForTicketTags(['quarterly'], req)).toBe(false);
    }
  });
});

describe('quarterlyBookingConfig (Cal.com prefill)', () => {
  it('prefills name + email and ties the booking to the prep', () => {
    const cfg = quarterlyBookingConfig(openReq, { user: { name: 'Gail Windisch', email: 'gail@tidewater.com' }, account: { company: 'Tidewater Property' } });
    expect(cfg).toEqual({ name: 'Gail Windisch', email: 'gail@tidewater.com', notes: 'Q4 2026 Quarterly Meeting — Tidewater Property (prep submitted via the Growth Portal)' });
  });
  it('omits blanks rather than sending empty strings to Cal', () => {
    const cfg = quarterlyBookingConfig(null, { user: {}, account: null });
    expect(cfg).toEqual({ notes: 'Quarterly Meeting (prep submitted via the Growth Portal)' });
  });
  it('points at the quarterly event type', () => {
    expect(CAL_QUARTERLY.namespace).toBe('alloy-quarterly-meeting');
    expect(CAL_QUARTERLY.link).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/);
  });
});

describe('booked state (Cal.com embed event → the button retires)', () => {
  const submitted = { ...openReq, status: 'submitted' };
  const booked = { ...submitted, meetingAt: '2026-10-15T19:00:00.000Z' };

  it('offers the booking only while submitted AND not yet booked; shows the meeting once booked', () => {
    expect(quarterlyBookingForTicketTags(['quarterly'], submitted)).toBe(submitted);
    expect(quarterlyBookingForTicketTags(['quarterly'], booked)).toBeNull();
    expect(quarterlyMeetingForTicketTags(['quarterly'], booked)).toBe(booked);
    expect(quarterlyMeetingForTicketTags(['quarterly'], submitted)).toBeNull();
    expect(quarterlyMeetingForTicketTags(['newsletter'], booked)).toBeNull();
    expect(quarterlyMeetingForTicketTags(['quarterly'], { ...booked, status: 'closed' })).toBeNull();
  });

  it('parses both embed event shapes and rejects one without a start', () => {
    expect(parseCalBooking({ type: 'bookingSuccessfulV2', data: { uid: 'u1', title: 'Alloy Quarterly Meeting', startTime: '2026-10-15T19:00:00Z', endTime: '2026-10-15T19:30:00Z', videoCallUrl: 'https://meet/x' } }))
      .toEqual({ uid: 'u1', startTime: '2026-10-15T19:00:00.000Z', endTime: '2026-10-15T19:30:00.000Z', title: 'Alloy Quarterly Meeting', videoCallUrl: 'https://meet/x' });
    expect(parseCalBooking({ data: { eventType: { title: 'Quarterly' }, date: '2026-10-15T19:00:00Z', duration: 30, booking: { uid: 'u2' } } }))
      .toEqual({ uid: 'u2', startTime: '2026-10-15T19:00:00.000Z', endTime: null, title: 'Quarterly', videoCallUrl: null });
    expect(parseCalBooking({ data: { confirmed: true } })).toBeNull();
    expect(parseCalBooking(null)).toBeNull();
    expect(parseCalBooking({ data: { startTime: 'not a date' } })).toBeNull();
  });

  it('formats the meeting time for people, and blanks a bad one', () => {
    expect(formatMeetingAt('2026-10-15T19:00:00Z')).toMatch(/Oct 15 · \d{1,2}:\d{2}/);
    expect(formatMeetingAt('nope')).toBe('');
    expect(formatMeetingAt(null)).toBe('');
  });

  describe('recordQuarterlyBooking', () => {
    const saved = DATA.quarterlyRequest;
    afterEach(() => { DATA.quarterlyRequest = saved; });

    it('flips the in-memory round to booked once; a repeat for the same time is a no-op', async () => {
      DATA.quarterlyRequest = { ...submitted };
      const b = parseCalBooking({ data: { uid: 'u1', startTime: '2026-10-15T19:00:00Z', title: 'Q' } });
      expect(await recordQuarterlyBooking(submitted, b)).toBe(true);
      expect(DATA.quarterlyRequest).toMatchObject({ id: 'r1', status: 'submitted', meetingAt: '2026-10-15T19:00:00.000Z', meetingUid: 'u1' });
      expect(DATA.quarterlyRequest.meetingMeta).toMatchObject({ title: 'Q', source: 'embed' });
      expect(await recordQuarterlyBooking(submitted, b)).toBe(false); // Cal fires both event shapes
      expect(quarterlyBookingForTicketTags(['quarterly'])).toBeNull();
      expect(quarterlyMeetingForTicketTags(['quarterly'])).toBe(DATA.quarterlyRequest);
    });
    it('ignores a booking with nothing usable', async () => {
      DATA.quarterlyRequest = { ...submitted };
      expect(await recordQuarterlyBooking(submitted, null)).toBe(false);
      expect(await recordQuarterlyBooking(null, { startTime: '2026-10-15T19:00:00Z' })).toBe(false);
      expect(DATA.quarterlyRequest.meetingAt).toBeUndefined();
    });
  });
});
