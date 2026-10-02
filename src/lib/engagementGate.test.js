import { describe, it, expect } from 'vitest';
import {
  proposalGateState, isPortalLocked, canAcceptProposal, validateAcceptForm, validateChangeRequest,
  engagementRowToView, normalizeReferenceLinks, parseLinkLines, formatLinkLines, invalidLinkLines, normalizeThread, fmtWhen,
  labelFromUrl, proposalAgreementText, PROPOSAL_AGREEMENT_VERSION, paragraphs, fmtMoney, statusLabel,
} from './engagementGate.js';

const owner = { id: 'u1', role: 'owner', isStaff: false };
const sent = { id: 'p1', status: 'sent' };

describe('proposalGateState', () => {
  it('locks a client while the proposal is sent', () => {
    expect(proposalGateState({ user: owner, engagement: sent })).toBe('locked');
    expect(isPortalLocked({ user: owner, engagement: sent })).toBe(true);
  });
  it('locks every client role, not just the owner (they can read, only the owner accepts)', () => {
    expect(proposalGateState({ user: { ...owner, role: 'staff' }, engagement: sent })).toBe('locked');
    expect(proposalGateState({ user: { ...owner, role: 'accounting' }, engagement: sent })).toBe('locked');
  });
  it('never locks Alloy staff (they run the account); View-as-client is gated as a client', () => {
    expect(proposalGateState({ user: { ...owner, isStaff: true, role: 'admin' }, engagement: sent })).toBe('none');
    // App.jsx flips isStaff off for the preview → same as a client.
    expect(proposalGateState({ user: { ...owner, isStaff: false }, engagement: sent })).toBe('locked');
  });
  it('opens the portal once accepted, and stays quiet for drafts / withdrawn / nothing', () => {
    expect(proposalGateState({ user: owner, engagement: { status: 'accepted' } })).toBe('accepted');
    expect(proposalGateState({ user: owner, engagement: { status: 'draft' } })).toBe('none');
    expect(proposalGateState({ user: owner, engagement: { status: 'withdrawn' } })).toBe('none');
    expect(proposalGateState({ user: owner, engagement: null })).toBe('none');
    expect(proposalGateState({})).toBe('none');
  });
});

describe('canAcceptProposal', () => {
  it('only the client owner', () => {
    expect(canAcceptProposal(owner)).toBe(true);
    expect(canAcceptProposal({ ...owner, role: 'accounting' })).toBe(false);
    expect(canAcceptProposal({ ...owner, role: 'staff' })).toBe(false);
    expect(canAcceptProposal({ ...owner, isStaff: true, role: 'admin' })).toBe(false);
    expect(canAcceptProposal(null)).toBe(false);
  });
});

describe('validateAcceptForm / validateChangeRequest', () => {
  it('needs a name and the confirmation', () => {
    expect(validateAcceptForm({ name: 'J', agree: true }).errors.name).toBeTruthy();
    expect(validateAcceptForm({ name: 'Jeff Harman', agree: false }).errors.agree).toBeTruthy();
    expect(validateAcceptForm({ name: 'Jeff Harman', agree: true }).ok).toBe(true);
  });
  it('change requests need substance and a ceiling', () => {
    expect(validateChangeRequest('hi').ok).toBe(false);
    expect(validateChangeRequest('  Can we start in November instead?  ')).toEqual({ ok: true, message: 'Can we start in November instead?' });
    expect(validateChangeRequest('x'.repeat(4001)).ok).toBe(false);
  });
});

describe('engagementRowToView', () => {
  it('maps the DB row and defaults the gaps', () => {
    const v = engagementRowToView({
      id: 'p1', account_id: 'a1', status: 'sent', title: 'T', locations_count: '3', modules: ['gbp'],
      monthly_amount: '4250.00', reference_links: [{ label: 'Audit', url: 'https://view.alloygp.co/x/audit.html' }, { url: 'nope' }],
      version: 2, sent_at: '2026-09-30T00:00:00Z',
    });
    expect(v).toMatchObject({ id: 'p1', status: 'sent', locationsCount: 3, modules: ['gbp'], monthlyAmount: 4250, version: 2 });
    expect(v.referenceLinks).toEqual([{ label: 'Audit', url: 'https://view.alloygp.co/x/audit.html' }]);
    expect(v.setupAmount).toBeNull(); expect(v.thread).toEqual([]);
  });
  it('null in, null out; a bad location count becomes 1', () => {
    expect(engagementRowToView(null)).toBeNull();
    expect(engagementRowToView({ id: 'p', locations_count: 0 }).locationsCount).toBe(1);
  });
});

describe('normalizeThread', () => {
  it('orders by time, defaults role to client, drops junk', () => {
    const t = normalizeThread([
      { at: '2026-09-30T15:00:00Z', name: 'Skyler', role: 'staff', message: 'Moved to Dec 1.' },
      { at: '2026-09-30T14:00:00Z', name: 'Jeff', email: 'j@x.co', message: 'Can we start Dec 1?' },
      { at: '2026-09-30T16:00:00Z', message: '   ' }, null, 'nope',
    ]);
    expect(t.map((m) => m.role)).toEqual(['client', 'staff']);
    expect(t[0].message).toBe('Can we start Dec 1?'); expect(t[0].email).toBe('j@x.co');
    expect(normalizeThread(undefined)).toEqual([]);
  });
  it('fmtWhen is short and safe', () => {
    expect(fmtWhen('2026-09-30T15:04:00Z')).toMatch(/Sep 30/);
    expect(fmtWhen('garbage')).toBe(''); expect(fmtWhen(null)).toBe('');
  });
});

describe('reference links', () => {
  it('normalizes, drops non-http, and labels bare URLs from the path', () => {
    expect(normalizeReferenceLinks([{ url: 'https://view.alloygp.co/cmgt/audit/cmgt-growth-audit-q2-2026.html' }, { label: 'x', url: 'javascript:alert(1)' }, null]))
      .toEqual([{ label: 'Cmgt Growth Audit Q2 2026', url: 'https://view.alloygp.co/cmgt/audit/cmgt-growth-audit-q2-2026.html' }]);
    expect(labelFromUrl('https://view.alloygp.co/')).toBe('view.alloygp.co');
  });
  it('round-trips the Admin textarea format', () => {
    const text = 'Growth audit | https://view.alloygp.co/a/audit.html\nhttps://view.alloygp.co/a/playbook.html\n\nnot a link';
    const parsed = parseLinkLines(text);
    expect(parsed).toHaveLength(3);
    expect(invalidLinkLines(text)).toEqual(['not a link']);
    const links = normalizeReferenceLinks(parsed);
    expect(links).toHaveLength(2);
    expect(formatLinkLines(links)).toBe('Growth audit | https://view.alloygp.co/a/audit.html\nPlaybook | https://view.alloygp.co/a/playbook.html');
  });
});

describe('copy helpers', () => {
  it('agreement text names the company and the money when set', () => {
    const t = proposalAgreementText('CMGT', { monthlyAmount: 4250, setupAmount: 1500 });
    expect(t).toContain('On behalf of CMGT');
    expect(t).toContain('$4,250/month');
    expect(t).toContain('$1,500 setup');
    expect(proposalAgreementText('', {})).toContain('my company');
    expect(PROPOSAL_AGREEMENT_VERSION).toBe('v2');
  });
  it('paragraphs split on blank lines; money drops cents when whole', () => {
    expect(paragraphs('a\n\n  b  \n\n\nc')).toEqual(['a', 'b', 'c']);
    expect(fmtMoney(4250)).toBe('$4,250');
    expect(fmtMoney(4250.5)).toBe('$4,250.50');
    expect(statusLabel('sent')).toMatch(/locked/);
  });
});
