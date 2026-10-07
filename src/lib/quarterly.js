import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';
import { zdCreate, zdUpload } from './zendesk.js';
import { track } from './track.js';

// Quarterly meeting prep intake — the quarterly twin of `newsletter.js`.
//
// Before each quarterly planning meeting, staff open a round for a client
// (Admin → Quarterly Meetings → `quarterly_requests` row, status 'open') and
// put a `quarterly`-tagged ticket in their portal. While a round is open that
// ticket shows an "Open Form" button; the client answers five short questions
// about last quarter + what's ahead. Submit mirrors the New Request flow: stage
// any files as Zendesk uploads, create a ticket (tagged `quarterly` so it's
// filterable), then stamp the account's open row as submitted so the button
// clears and staff can read the answers in the Admin tracker before the meeting.

const clean = (s) => String(s || '').trim();

// Ticket tags that mean "this is the quarterly meeting prep ticket". Staff tag
// tickets by hand in Zendesk, so accept the obvious spellings.
export const QUARTERLY_TAGS = ['quarterly', 'quarterly_meeting', 'quarterly-meeting'];

// The open quarterly round to surface on a ticket, or null. Like the newsletter:
// a `quarterly`-tagged ticket shows an "Open Form" button — but only while
// there's an open round to submit to. `req` defaults to the loaded account's
// round (DATA.quarterlyRequest); passing it explicitly keeps this testable.
export function quarterlyForTicketTags(tags, req = DATA.quarterlyRequest) {
  if (!req || req.status !== 'open') return null;
  return (tags || []).some((t) => QUARTERLY_TAGS.includes(String(t).toLowerCase())) ? req : null;
}

// Calendar quarter label for a date — "Q4 2026". The default round title; staff
// can rename it when they open the round.
export function quarterLabel(now = new Date()) {
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}
export function defaultQuarterlyTitle(now = new Date()) {
  return `${quarterLabel(now)} Quarterly Meeting`;
}

// The five prompts. Order here = order in the form, the ticket body and the
// admin tracker. Every section is conditional (see buildQuarterlyBody): no
// single question is required — one answer anywhere is a valid submission.
export const QUARTERLY_SECTIONS = [
  ['wins', 'Went well last quarter'],
  ['misses', 'Didn’t go as planned'],
  ['changes', 'Changes in the business'],
  ['priorities', 'Priorities for next quarter'],
  ['topics', 'Topics for the meeting'],
];

// True when at least one prompt has an answer.
export function hasQuarterlyAnswer(form) {
  return QUARTERLY_SECTIONS.some(([k]) => clean(form && form[k]));
}

// Compose the human-readable ticket body from the answers. Empty sections are
// skipped, so a ticket never reads as a wall of blank headings.
export function buildQuarterlyBody(form, title) {
  const parts = [`Quarterly meeting prep — ${title}`, ''];
  QUARTERLY_SECTIONS.forEach(([key, heading]) => {
    if (clean(form[key])) parts.push(`${heading}:\n${clean(form[key])}\n`);
  });
  return parts.join('\n').trimEnd();
}

// Submit the quarterly prep. `requestId` is the quarterly_requests row id (from
// DATA.quarterlyRequest). Returns { ticketId }.
export async function submitQuarterly(requestId, form, files) {
  const title = (DATA.quarterlyRequest && DATA.quarterlyRequest.title) || 'Quarterly Meeting';
  const company = DATA.account && DATA.account.company ? ` — ${DATA.account.company}` : '';

  // 1) Stage attachments as Zendesk upload tokens (reuses the New Request path).
  let uploads = [];
  if (files && files.length) uploads = (await Promise.all(files.map((f) => zdUpload(f)))).filter(Boolean);

  // 2) Create the ticket on the account's org, tagged so it routes as quarterly prep.
  const subject = `Quarterly meeting prep — ${title}${company}`;
  const res = await zdCreate({ subject, body: buildQuarterlyBody(form, title), priority: 'normal', uploads, tags: ['quarterly'] });
  const ticketId = res && res.id ? res.id : null;

  // 3) Record the submission on the request row (RLS: the client owns their row).
  if (isSupabaseConfigured && requestId) {
    const submission = {};
    QUARTERLY_SECTIONS.forEach(([k]) => { submission[k] = clean(form[k]); });
    submission.attachments = (files || []).map((f) => f.name);
    const { error } = await supabase.from('quarterly_requests').update({
      status: 'submitted',
      submission,
      zendesk_ticket_id: ticketId,
      submitted_at: new Date().toISOString(),
      submitted_by: (DATA.user && DATA.user.name) || '',
    }).eq('id', requestId);
    if (error) throw error;
  }

  // Log the submission for the admin "who filled it out" analytics (client-only).
  if (requestId) track('quarterly_submit', { requestId });

  // Clear the prompt immediately (the next load won't return it as 'open').
  DATA.quarterlyRequest = null;
  return { ticketId };
}
