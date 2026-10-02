import { describe, it, expect } from 'vitest';
import { blankProposalForm, viewToForm, formToRow, validateProposalForm, validateForSend, sendWarnings, sendChecklist, activityFromEvents, groupClients } from './adminEngagement.js';
import { PLAN_TEMPLATES } from './proposalPlans.js';

describe('blankProposalForm', () => {
  it('prefills title, legal name, location count and the three standard plans', () => {
    const f = blankProposalForm({ company: 'CMGT', locations: [{ name: 'Denham Springs' }, { name: 'Biloxi' }] });
    expect(f.title).toBe('Growth partnership for CMGT');
    expect(f.clientLegalName).toBe('CMGT');
    expect(f.locationsCount).toBe(2);
    expect(f.plans.map((p) => p.name)).toEqual(['Steady', 'Accelerate', 'Ascend']);
    expect(f.plans.find((p) => p.recommended).key).toBe('accelerate');
    expect(f.exclusivityMiles).toBe('16'); expect(f.preparedByPhone).toBe(''); expect(f.preparedByEmail).toBe(''); expect(f.nextStepsTitle).toBe('');
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
      ...good, title: '  T ', startDate: '2026-11-01T00:00:00Z',
      exclusivityMiles: '20', preparedByPhone: ' (555) 555-0100 ', preparedByEmail: ' Cameron@AlloyGP.co ', nextStepsTitle: ' Say yes. ', clientEntityType: ' LLC ',
      testimonialVimeoId: 'https://vimeo.com/1131397045'.replace(/\D/g, ''), welcomeCallUrl: 'https://cal.com/alloy/welcome',
      linksText: 'Audit | https://view.alloygp.co/a.html\nnot a link',
    });
    expect(row).toMatchObject({ title: 'T', start_date: '2026-11-01', exclusivity_miles: 20, prepared_by_phone: '(555) 555-0100', prepared_by_email: 'cameron@alloygp.co', next_steps_title: 'Say yes.', client_entity_type: 'LLC', testimonial_vimeo_id: '1131397045', welcome_call_url: 'https://cal.com/alloy/welcome' });
    expect(row.plans).toHaveLength(3);
    expect(row).toMatchObject({ monthly_amount: 6850, setup_amount: 2500, term_months: 12, locations_count: 3 }); // Accelerate is recommended
    expect(row.plans[1]).toMatchObject({ key: 'accelerate', matchHoa: true, fuel: 70 });
    expect(row.modules).toBeUndefined(); expect(row.intro).toBeUndefined();          // v3: no module picker, no intro
    expect(row.reference_links).toEqual([{ label: 'Audit', url: 'https://view.alloygp.co/a.html' }]);
    expect(row.compare_rows.monthly).toBe(true);
  });
  it('drops a bad welcome link and an empty legal field to null', () => {
    const row = formToRow({ ...good, welcomeCallUrl: 'calendly', clientAddress: '  ' });
    expect(row.welcome_call_url).toBeNull(); expect(row.client_address).toBeNull();
  });
  it('round-trips through the view shape', () => {
    const view = {
      title: 'T', locationsCount: 3,
      plans: PLAN_TEMPLATES, compareRows: { referral: false }, exclusivityMiles: 20, preparedByPhone: '5555550100', preparedByEmail: 'c@alloygp.co', nextStepsTitle: 'Go.',
      clientLegalName: 'Community Management, LLC', clientEntityType: 'Louisiana LLC', clientAddress: '140 Aspen Sq',
      testimonialVimeoId: '1131397045', testimonialCaption: 'Client testimonial · 2:58', welcomeCallUrl: 'https://cal.com/x',
      validThrough: '2026-10-30', startDate: '2026-11-01', referenceLinks: [{ label: 'A', url: 'https://x.co/a' }],
      monthlyAmount: 6850, setupAmount: 2500, termMonths: 12,
    };
    const f = viewToForm(view);
    expect(f.linksText).toBe('A | https://x.co/a'); expect(f.compareRows.referral).toBe(false); expect(f.plans).toHaveLength(3);
    expect(formToRow(f)).toMatchObject({ client_legal_name: 'Community Management, LLC', valid_through: '2026-10-30', start_date: '2026-11-01', exclusivity_miles: 20, prepared_by_phone: '5555550100', next_steps_title: 'Go.' });
  });
});

describe('validation', () => {
  const good = { ...blankProposalForm({ company: 'CMGT', locations: [] }), preparedByEmail: 'c@alloygp.co', clientEntityType: 'Louisiana limited liability company', clientAddress: '140 Aspen Square, Denham Springs, LA', startDate: '2026-11-01' };
  it('a complete form passes both levels', () => {
    expect(validateProposalForm(good).ok).toBe(true);
    expect(validateForSend(good).ok).toBe(true);
  });
  it('draft-level catches a broken document', () => {
    expect(validateProposalForm({ ...good, title: 'ab' }).errors.title).toBeTruthy();
    expect(validateProposalForm({ ...good, plans: [] }).errors.plans).toBeTruthy();
    expect(validateProposalForm({ ...good, plans: [{ name: 'Core', monthly: 0 }] }).errors.plans).toMatch(/monthly/);
    expect(validateProposalForm({ ...good, exclusivityMiles: '2.5' }).errors.exclusivityMiles).toBeTruthy();
    expect(validateProposalForm({ ...good, preparedByEmail: 'not-an-email' }).errors.preparedByEmail).toBeTruthy();
    expect(validateProposalForm({ ...good, linksText: 'ftp://x' }).errors.linksText).toMatch(/Not a link/);
    expect(validateProposalForm({ ...good, welcomeCallUrl: 'calendly' }).errors.welcomeCallUrl).toBeTruthy();
    expect(validateProposalForm({ ...good, testimonialVimeoId: 'abc' }).errors.testimonialVimeoId).toBeTruthy();
  });
  it('send-level requires the legal identity and the effective date', () => {
    const r = validateForSend({ ...good, clientLegalName: '', clientEntityType: '', clientAddress: '', startDate: '' });
    expect(Object.keys(r.errors).sort()).toEqual(['clientAddress', 'clientEntityType', 'clientLegalName', 'startDate']);
    expect(validateProposalForm({ ...good, clientLegalName: '' }).ok).toBe(true); // drafts may be incomplete
  });
  it('warns (does not block) on missing contact, video, docs, scheduling link', () => {
    expect(sendWarnings({ preparedByPhone: '', preparedByEmail: '', testimonialVimeoId: '', linksText: '', welcomeCallUrl: '' })).toHaveLength(4);
    expect(sendWarnings({ preparedByEmail: 'c@alloygp.co', testimonialVimeoId: '1', linksText: 'A | https://x.co/a', welcomeCallUrl: 'https://cal.com/x' })).toHaveLength(0);
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

describe('groupClients', () => {
  const accounts = [
    { id: 'alloy', short_name: 'Alloy', tier: 'internal' },
    { id: 'cmgt', short_name: 'CMGT', tier: 'Steady' },
    { id: 'cma', short_name: 'CMA', tier: 'Accelerate' },
    { id: 'cpe', short_name: 'CPE', tier: 'Ascend' },
    { id: 'rise', short_name: 'RISE', tier: 'Steady' },
  ];
  it('splits pipeline, clients (accepted or legacy) and the internal Alloy account, keeping list order', () => {
    const g = groupClients(accounts, { cma: 'sent', cpe: 'draft', rise: 'accepted' });
    expect(g.map((x) => [x.key, x.accounts.map((a) => a.id)])).toEqual([
      ['proposal', ['cma', 'cpe']],
      ['clients', ['cmgt', 'rise']],
      ['internal', ['alloy']],
    ]);
  });
  it('drops empty groups and treats a withdrawn/unknown status as a plain client', () => {
    expect(groupClients(accounts.slice(1), { cmgt: 'withdrawn' }).map((x) => x.key)).toEqual(['clients']);
  });
  it('is stable before statuses load (null → everyone is a client, internal still split out)', () => {
    expect(groupClients(accounts, null).map((x) => [x.key, x.accounts.length])).toEqual([['clients', 4], ['internal', 1]]);
    expect(groupClients(null, null)).toEqual([]);
  });
});
