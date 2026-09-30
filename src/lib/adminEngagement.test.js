import { describe, it, expect } from 'vitest';
import { blankProposalForm, viewToForm, formToRow, validateProposalForm, validateForSend, sendWarnings, sendChecklist, activityFromEvents } from './adminEngagement.js';
import { DEFAULT_MODULES } from './engagementCatalog.js';
import { PLAN_TEMPLATES } from './proposalPlans.js';

describe('blankProposalForm', () => {
  it('prefills title, legal name, location count and the three standard plans', () => {
    const f = blankProposalForm({ company: 'CMGT', locations: [{ name: 'Denham Springs' }, { name: 'Biloxi' }] });
    expect(f.title).toBe('Growth partnership for CMGT');
    expect(f.clientLegalName).toBe('CMGT');
    expect(f.locationsCount).toBe(2);
    expect(f.modules).toEqual(DEFAULT_MODULES);
    expect(f.plans.map((p) => p.name)).toEqual(['Core', 'Growth', 'Scale']);
    expect(f.plans.find((p) => p.recommended).key).toBe('growth');
    expect(f.exclusivityMiles).toBe('16'); expect(f.roiFeePerDoor).toBe('14'); expect(f.roiDoorsPerCommunity).toBe('150');
    expect(f.testimonialVimeoId).toBe('1131397045');
    expect(Object.values(f.compareRows).every(Boolean)).toBe(true);
  });
  it('defaults to one location when none are on the account', () => {
    expect(blankProposalForm({ company: 'X', locations: [] }).locationsCount).toBe(1);
    expect(blankProposalForm().title).toBe('Growth partnership proposal');
  });
});

describe('formToRow / viewToForm', () => {
  const good = blankProposalForm({ company: 'CMGT', locations: [] });
  it('normalises plans, mirrors the recommended plan into the v1 summary columns, coerces the rest', () => {
    const row = formToRow({
      ...good, title: '  T ', modules: ['gbp', 'bogus'], startDate: '2026-11-01T00:00:00Z',
      exclusivityMiles: '20', roiFeePerDoor: '$14', roiDoorsPerCommunity: '150', clientEntityType: ' LLC ',
      testimonialVimeoId: 'https://vimeo.com/1131397045'.replace(/\D/g, ''), welcomeCallUrl: 'https://cal.com/alloy/welcome',
      linksText: 'Audit | https://view.alloygp.co/a.html\nnot a link',
    });
    expect(row).toMatchObject({ title: 'T', modules: ['gbp'], start_date: '2026-11-01', exclusivity_miles: 20, roi_fee_per_door: 14, roi_doors_per_community: 150, client_entity_type: 'LLC', testimonial_vimeo_id: '1131397045', welcome_call_url: 'https://cal.com/alloy/welcome' });
    expect(row.plans).toHaveLength(3);
    expect(row).toMatchObject({ monthly_amount: 6850, setup_amount: 2500, term_months: 12, locations_count: 3 }); // Growth is recommended
    expect(row.reference_links).toEqual([{ label: 'Audit', url: 'https://view.alloygp.co/a.html' }]);
    expect(row.compare_rows.monthly).toBe(true);
  });
  it('drops a bad welcome link and an empty legal field to null', () => {
    const row = formToRow({ ...good, welcomeCallUrl: 'calendly', clientAddress: '  ' });
    expect(row.welcome_call_url).toBeNull(); expect(row.client_address).toBeNull();
  });
  it('round-trips through the view shape', () => {
    const view = {
      title: 'T', intro: 'i', closing: 'c', locationsCount: 3, modules: ['gbp'],
      plans: PLAN_TEMPLATES, compareRows: { referral: false }, exclusivityMiles: 20, roiFeePerDoor: 14, roiDoorsPerCommunity: 150,
      clientLegalName: 'Community Management, LLC', clientEntityType: 'Louisiana LLC', clientAddress: '140 Aspen Sq',
      testimonialVimeoId: '1131397045', testimonialCaption: 'Client testimonial · 2:58', welcomeCallUrl: 'https://cal.com/x',
      validThrough: '2026-10-30', startDate: '2026-11-01', referenceLinks: [{ label: 'A', url: 'https://x.co/a' }],
      monthlyAmount: 6850, setupAmount: 2500, termMonths: 12,
    };
    const f = viewToForm(view);
    expect(f.linksText).toBe('A | https://x.co/a'); expect(f.compareRows.referral).toBe(false); expect(f.plans).toHaveLength(3);
    expect(formToRow(f)).toMatchObject({ client_legal_name: 'Community Management, LLC', valid_through: '2026-10-30', start_date: '2026-11-01', exclusivity_miles: 20 });
  });
});

describe('validation', () => {
  const good = { ...blankProposalForm({ company: 'CMGT', locations: [] }), intro: 'Why this plan.', clientEntityType: 'Louisiana limited liability company', clientAddress: '140 Aspen Square, Denham Springs, LA', startDate: '2026-11-01' };
  it('a complete form passes both levels', () => {
    expect(validateProposalForm(good).ok).toBe(true);
    expect(validateForSend(good).ok).toBe(true);
  });
  it('draft-level catches a broken document', () => {
    expect(validateProposalForm({ ...good, title: 'ab' }).errors.title).toBeTruthy();
    expect(validateProposalForm({ ...good, plans: [] }).errors.plans).toBeTruthy();
    expect(validateProposalForm({ ...good, plans: [{ name: 'Core', monthly: 0 }] }).errors.plans).toMatch(/monthly/);
    expect(validateProposalForm({ ...good, exclusivityMiles: '2.5' }).errors.exclusivityMiles).toBeTruthy();
    expect(validateProposalForm({ ...good, roiFeePerDoor: 'abc' }).errors.roiFeePerDoor).toBeTruthy();
    expect(validateProposalForm({ ...good, linksText: 'ftp://x' }).errors.linksText).toMatch(/Not a link/);
    expect(validateProposalForm({ ...good, welcomeCallUrl: 'calendly' }).errors.welcomeCallUrl).toBeTruthy();
    expect(validateProposalForm({ ...good, testimonialVimeoId: 'abc' }).errors.testimonialVimeoId).toBeTruthy();
  });
  it('send-level requires the legal identity and the effective date', () => {
    const r = validateForSend({ ...good, clientLegalName: '', clientEntityType: '', clientAddress: '', startDate: '' });
    expect(Object.keys(r.errors).sort()).toEqual(['clientAddress', 'clientEntityType', 'clientLegalName', 'startDate']);
    expect(validateProposalForm({ ...good, clientLegalName: '' }).ok).toBe(true); // drafts may be incomplete
  });
  it('warns (does not block) on missing intro, video, docs, scheduling link', () => {
    expect(sendWarnings({ intro: '', testimonialVimeoId: '', linksText: '', welcomeCallUrl: '' })).toHaveLength(4);
    expect(sendWarnings(good)).toEqual(['No reference documents linked.', 'No welcome-call scheduling link — the accepted state will say we’ll reach out.']);
  });
});

describe('sendChecklist', () => {
  const form = { ...blankProposalForm({ company: 'CMGT', locations: [{ name: 'A' }] }), clientEntityType: 'LLC', clientAddress: 'x', startDate: '2026-11-01' };
  it('all green with a complete form and an owner', () => {
    const c = sendChecklist(form, [{ role: 'owner', is_staff: false }]);
    expect(c.every((x) => x.ok)).toBe(true);
    expect(c.map((x) => x.key)).toEqual(['markets', 'plan', 'legal', 'entity', 'start', 'owner']);
  });
  it('flags what is missing; only the owner is soft', () => {
    const c = sendChecklist({ ...form, markets: [], clientAddress: '' }, [{ role: 'staff', is_staff: false }]);
    expect(c.find((x) => x.key === 'markets')).toMatchObject({ ok: false, hard: true });
    expect(c.find((x) => x.key === 'entity')).toMatchObject({ ok: false, hard: true });
    expect(c.find((x) => x.key === 'owner')).toMatchObject({ ok: false, hard: false });
    const hidden = { ...form, plans: form.plans.map((p) => ({ ...p, show: false })) };
    expect(sendChecklist(hidden, []).find((x) => x.key === 'plan').ok).toBe(false);
  });
});

describe('activityFromEvents', () => {
  it('turns proposal events into a dated feed with first names, newest first, plus the send', () => {
    const a = activityFromEvents([
      { user_id: 'u1', type: 'proposal_viewed', meta: { version: 2 }, created_at: '2026-09-30T14:00:00Z' },
      { user_id: 'u1', type: 'proposal_agreement_opened', meta: {}, created_at: '2026-09-30T15:00:00Z' },
      { user_id: 'u1', type: 'login', meta: {}, created_at: '2026-09-30T16:00:00Z' },
    ], { u1: 'Jeff' }, { sentAt: '2026-09-30T13:00:00Z', version: 2 });
    expect(a.map((x) => x.what)).toEqual(['Jeff opened the agreement', 'Jeff viewed v2', 'You sent v2']);
  });
  it('is quiet with nothing', () => { expect(activityFromEvents([], {}, null)).toEqual([]); });
});
