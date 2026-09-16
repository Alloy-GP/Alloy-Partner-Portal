import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';
import { zdCreate, zdUpload } from './zendesk.js';
import { track } from './track.js';

// Newsletter intake submit. Mirrors the New Request flow: stage any files as
// Zendesk uploads, create a ticket (tagged `newsletter` so it's filterable),
// then stamp the account's open newsletter_requests row as submitted so the
// portal banner clears and staff can track it in the Admin tracker.

const clean = (s) => String(s || '').trim();

// The open newsletter round to surface on a ticket, or null. Like the video→
// guide mechanism: a ticket tagged `newsletter` shows an "Open Form" button —
// but only while there's an open round to submit to.
export function newsletterForTicketTags(tags) {
  const nl = DATA.newsletterRequest;
  return (nl && nl.status === 'open' && (tags || []).includes('newsletter')) ? nl : null;
}

// Compose the human-readable ticket body from the answers.
// Every section is conditional, because no single question is required — one
// answer anywhere is a valid submission, and a ticket full of empty headings
// reads like the client ignored us when they did not.
const SECTIONS = [
  ['highlights', 'This past month'],
  ['focus', 'Coming months'],
  ['events', 'Events'],
  ['people', 'New to the team'],
  ['excited', 'Excited about'],
];
function buildBody(form, title) {
  const parts = [`Newsletter content — ${title}`, ''];
  SECTIONS.forEach(([key, heading]) => {
    if (clean(form[key])) parts.push(`${heading}:\n${clean(form[key])}\n`);
  });
  return parts.join('\n').trimEnd();
}

// Submit a newsletter intake. `requestId` is the newsletter_requests row id
// (from DATA.newsletterRequest). Returns { ticketId }.
export async function submitNewsletter(requestId, form, files) {
  const title = (DATA.newsletterRequest && DATA.newsletterRequest.title) || 'Newsletter';
  const company = DATA.account && DATA.account.company ? ` — ${DATA.account.company}` : '';

  // 1) Stage attachments as Zendesk upload tokens (reuses the New Request path).
  let uploads = [];
  if (files && files.length) uploads = (await Promise.all(files.map((f) => zdUpload(f)))).filter(Boolean);

  // 2) Create the ticket on the account's org, tagged so it routes as a newsletter.
  const subject = `Newsletter content — ${title}${company}`;
  const res = await zdCreate({ subject, body: buildBody(form, title), priority: 'normal', uploads, tags: ['newsletter'] });
  const ticketId = res && res.id ? res.id : null;

  // 3) Record the submission on the request row (RLS: the client owns their row).
  if (isSupabaseConfigured && requestId) {
    const submission = {
      // `feature`, `cta`, `links` and `notes` were dropped from the form in
      // Sept 2026 to cut the number of decisions a client has to make. Earlier
      // submissions still carry them and the Newsletter Room still renders them,
      // so nothing already collected loses detail.
      highlights: clean(form.highlights),
      focus: clean(form.focus),
      events: clean(form.events),
      people: clean(form.people),
      excited: clean(form.excited),
      attachments: (files || []).map((f) => f.name),
    };
    const { error } = await supabase.from('newsletter_requests').update({
      status: 'submitted',
      submission,
      zendesk_ticket_id: ticketId,
      submitted_at: new Date().toISOString(),
      submitted_by: (DATA.user && DATA.user.name) || '',
    }).eq('id', requestId);
    if (error) throw error;
  }

  // Log the submission for the admin "who filled it out" analytics (client-only).
  if (requestId) track('newsletter_submit', { requestId });

  // Clear the prompt immediately (the next load won't return it as 'open').
  DATA.newsletterRequest = null;
  return { ticketId };
}
