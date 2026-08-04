import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';
import { zdCreate, zdUpload } from './zendesk.js';
import { track } from './track.js';

// Newsletter intake submit. Mirrors the New Request flow: stage any files as
// Zendesk uploads, create a ticket (tagged `newsletter` so it's filterable),
// then stamp the account's open newsletter_requests row as submitted so the
// portal banner clears and staff can track it in the Admin tracker.

const clean = (s) => String(s || '').trim();

// Compose the human-readable ticket body from the answers.
function buildBody(form, title) {
  const links = (form.links || []).filter((l) => clean(l.url));
  const parts = [];
  parts.push(`Newsletter content — ${title}`);
  parts.push('');
  parts.push(`What's happening this month:\n${clean(form.highlights) || '—'}`);
  if (clean(form.feature)) parts.push(`\nTo feature / spotlight:\n${clean(form.feature)}`);
  if (clean(form.cta)) parts.push(`\nCall to action:\n${clean(form.cta)}`);
  if (links.length) {
    parts.push('\nLinks:');
    links.forEach((l) => parts.push(`- ${clean(l.label) ? clean(l.label) + ': ' : ''}${clean(l.url)}`));
  }
  if (clean(form.notes)) parts.push(`\nAnything else:\n${clean(form.notes)}`);
  return parts.join('\n');
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
      highlights: clean(form.highlights),
      feature: clean(form.feature),
      cta: clean(form.cta),
      links: (form.links || []).filter((l) => clean(l.url)).map((l) => ({ label: clean(l.label), url: clean(l.url) })),
      notes: clean(form.notes),
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
