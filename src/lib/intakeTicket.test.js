import { describe, it, expect } from 'vitest';
import {
  firstName, fillTemplate, pickDefaultAgent, parseEmails, TICKET_DEFAULTS, previewTicket, summarizeTickets,
} from './intakeTicket.js';

describe('fillTemplate / firstName', () => {
  it('fills every placeholder and blanks unknown values', () => {
    expect(fillTemplate('Hi {name}, {client} · {title} — {sender}', { name: 'Gail', client: 'Tidewater', title: 'Q4 2026 Quarterly Meeting', sender: 'Sharlene' }))
      .toBe('Hi Gail, Tidewater · Q4 2026 Quarterly Meeting — Sharlene');
    expect(fillTemplate('Hi {name},', {})).toBe('Hi ,');
    expect(fillTemplate('{nope} stays', { nope: 'x' })).toBe('{nope} stays');
    expect(fillTemplate(null, {})).toBe('');
  });
  it('takes the first word of a full name', () => {
    expect(firstName('Gail Windisch')).toBe('Gail');
    expect(firstName('  Ceanne Melkerson (POC) ')).toBe('Ceanne');
    expect(firstName('')).toBe('');
  });
});

describe('pickDefaultAgent', () => {
  const agents = [
    { id: '1', name: 'Justin', email: 'justin@alloygp.co' },
    { id: '2', name: 'Sharlene Smith', email: 'sharlene@alloygp.co' },
    { id: '3', name: 'Skyler Nelson', email: 'skyler@alloygp.co' },
  ];
  it('prefers Sharlene, by name or email', () => {
    expect(pickDefaultAgent(agents).id).toBe('2');
    expect(pickDefaultAgent([{ id: '9', name: 'S. S.', email: 'SHARLENE@alloygp.co' }]).id).toBe('9');
  });
  it('falls back to the first agent, and null for none', () => {
    expect(pickDefaultAgent(agents.filter((a) => a.id !== '2')).id).toBe('1');
    expect(pickDefaultAgent([])).toBeNull();
    expect(pickDefaultAgent(null)).toBeNull();
  });
});

describe('parseEmails', () => {
  it('splits on commas, semicolons and whitespace; keeps only emails; lower-cases; de-dupes', () => {
    expect(parseEmails('Skyler@alloygp.co, justin@alloygp.co; not-an-email  skyler@alloygp.co\nops@x.io'))
      .toEqual(['skyler@alloygp.co', 'justin@alloygp.co', 'ops@x.io']);
    expect(parseEmails('')).toEqual([]);
    expect(parseEmails(null)).toEqual([]);
  });
});

describe('TICKET_DEFAULTS / previewTicket', () => {
  it('has a subject + message for both intakes, each using the placeholders', () => {
    for (const k of ['newsletter', 'quarterly']) {
      expect(TICKET_DEFAULTS[k].subject).toContain('{title}');
      expect(TICKET_DEFAULTS[k].message).toContain('{name}');
      expect(TICKET_DEFAULTS[k].message).toContain('{sender}');
    }
  });
  it('subjects differ from the submission tickets so they never read as duplicates', () => {
    expect(TICKET_DEFAULTS.quarterly.subject.startsWith('Quarterly meeting prep')).toBe(false);
    expect(TICKET_DEFAULTS.newsletter.subject.startsWith('Newsletter content')).toBe(false);
  });
  it('previews one client with the picked recipient and sender', () => {
    const p = previewTicket(TICKET_DEFAULTS.quarterly, {
      recipient: { name: 'Gail Windisch' }, account: { short_name: 'Tidewater' },
      title: 'Q4 2026 Quarterly Meeting', sender: { name: 'Sharlene Smith' },
    });
    expect(p.subject).toBe('Q4 2026 Quarterly Meeting: a few questions before we meet');
    expect(p.message.startsWith('Hi Gail,')).toBe(true);
    expect(p.message.endsWith('Thanks,\nSharlene')).toBe(true);
    expect(p.message).not.toContain('{');
  });
});

describe('summarizeTickets', () => {
  it('lists sent tickets with recipient, sender and CCs, and failures by client', () => {
    const lines = summarizeTickets([
      { accountId: 'a1', ok: true, ticketId: '501', to: 'Gail Windisch', as: 'Sharlene Smith', cc: ['Ashley Renehan', 'skyler@alloygp.co'] },
      { accountId: 'a2', ok: true, ticketId: '502', to: 'Rim', cc: [] },
      { accountId: 'a3', ok: false, error: 'no recipient picked' },
    ], { a3: 'CPE' });
    expect(lines).toEqual([
      '2 tickets sent: #501 → Gail Windisch (as Sharlene) · cc Ashley Renehan, skyler@alloygp.co, #502 → Rim',
      '⚠ CPE: ticket not sent — no recipient picked',
    ]);
  });
  it('is empty when no tickets were attempted', () => {
    expect(summarizeTickets([])).toEqual([]);
    expect(summarizeTickets(undefined)).toEqual([]);
  });
});
