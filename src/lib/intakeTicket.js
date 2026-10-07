// The prompt ticket an intake round sends from the portal (newsletter and
// quarterly). Pure helpers: the default subject/message per intake, template
// filling for the preview, and the default sender/recipient picks. The `admin`
// edge function fills the same placeholders server-side when it creates the
// ticket, so what the preview shows is what the client gets.
//
// Placeholders: {name} recipient's first name · {client} the account's short
// name · {title} the round title · {sender} the sending agent's first name.

export const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

export function fillTemplate(tpl, vars = {}) {
  return String(tpl || '').replace(/\{(name|client|title|sender)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

// Who the ticket sends as. Sharlene by default (the user's ask); any other
// active agent can be picked. Falls back to the first agent so the panel never
// starts without a sender.
export function pickDefaultAgent(agents, preferred = /sharlene/i) {
  const list = Array.isArray(agents) ? agents : [];
  const hit = list.find((a) => preferred.test(a.name || '') || preferred.test(a.email || ''));
  return (hit || list[0] || null);
}

// Per-intake defaults. Subjects deliberately differ from the ticket the
// client's SUBMISSION creates ("Newsletter content — …" / "Quarterly meeting
// prep — …") so the two never read as duplicates in Zendesk.
export const TICKET_DEFAULTS = {
  newsletter: {
    subject: '{title}: what should we feature?',
    message: [
      'Hi {name},',
      '',
      'It’s time to gather content for the {title}. Open the form from this ticket in your Growth Portal and share a few quick highlights — one sentence each is plenty.',
      '',
      'Thanks,',
      '{sender}',
    ].join('\n'),
  },
  quarterly: {
    subject: '{title}: a few questions before we meet',
    message: [
      'Hi {name},',
      '',
      'Before our {title}, we’d love a quick read on last quarter from your side — what went well, what didn’t, what’s changed, and what matters most next.',
      '',
      'Open the form from this ticket in your Growth Portal (about five minutes), or just reply here.',
      '',
      'Thanks,',
      '{sender}',
    ].join('\n'),
  },
};

// Fill a subject + message for one account, for the preview.
export function previewTicket(ticket, { recipient, account, title, sender } = {}) {
  const vars = {
    name: firstName(recipient && recipient.name),
    client: (account && (account.short_name || account.company)) || '',
    title: title || '',
    sender: firstName(sender && sender.name),
  };
  return { subject: fillTemplate(ticket && ticket.subject, vars), message: fillTemplate(ticket && ticket.message, vars) };
}

// One line per ticket result for the "Opened for N clients" notice.
export function summarizeTickets(tickets, nameOf = {}) {
  const list = Array.isArray(tickets) ? tickets : [];
  const sent = list.filter((t) => t.ok);
  const failed = list.filter((t) => !t.ok);
  const parts = [];
  if (sent.length) parts.push(`${sent.length} ticket${sent.length === 1 ? '' : 's'} sent: ${sent.map((t) => `#${t.ticketId} → ${t.to || nameOf[t.accountId] || 'client'}${t.as ? ` (as ${firstName(t.as)})` : ''}`).join(', ')}`);
  failed.forEach((t) => parts.push(`⚠ ${nameOf[t.accountId] || 'A client'}: ticket not sent — ${t.error || 'unknown error'}`));
  return parts;
}
