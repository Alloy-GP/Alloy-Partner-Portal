import { describe, it, expect } from 'vitest';
import { blankProposalForm, viewToForm, formToRow, validateProposalForm, sendWarnings } from './adminEngagement.js';
import { DEFAULT_MODULES } from './engagementCatalog.js';

describe('blankProposalForm', () => {
  it('prefills the title and the location count from the account', () => {
    const f = blankProposalForm({ company: 'CMGT', locations: [{ name: 'Denham Springs' }, { name: 'Biloxi' }] });
    expect(f.title).toBe('Growth partnership for CMGT');
    expect(f.locationsCount).toBe(2);
    expect(f.modules).toEqual(DEFAULT_MODULES);
  });
  it('defaults to one location when none are on the account', () => {
    expect(blankProposalForm({ company: 'X', locations: [] }).locationsCount).toBe(1);
    expect(blankProposalForm().title).toBe('Growth partnership proposal');
  });
});

describe('formToRow / viewToForm', () => {
  it('coerces money, ints, dates and links; drops unknown modules', () => {
    const row = formToRow({
      title: '  T ', locationsCount: '3', modules: ['gbp', 'bogus'], monthlyAmount: '$4,250.00', setupAmount: '',
      startDate: '2026-11-01T00:00:00Z', termMonths: '12', linksText: 'Audit | https://view.alloygp.co/a.html\nnot a link',
    });
    expect(row).toMatchObject({ title: 'T', locations_count: 3, modules: ['gbp'], monthly_amount: 4250, setup_amount: null, start_date: '2026-11-01', term_months: 12 });
    expect(row.reference_links).toEqual([{ label: 'Audit', url: 'https://view.alloygp.co/a.html' }]);
  });
  it('round-trips through the view shape', () => {
    const view = {
      title: 'T', intro: 'i', closing: 'c', locationsCount: 2, modules: ['gbp'], monthlyAmount: 4250, setupAmount: 1500,
      startDate: '2026-11-01', termMonths: 12, referenceLinks: [{ label: 'A', url: 'https://x.co/a' }],
    };
    const f = viewToForm(view);
    expect(f.monthlyAmount).toBe('4250'); expect(f.linksText).toBe('A | https://x.co/a');
    expect(formToRow(f)).toMatchObject({ monthly_amount: 4250, setup_amount: 1500, term_months: 12, locations_count: 2 });
  });
});

describe('validateProposalForm', () => {
  const good = { title: 'Growth partnership', locationsCount: 2, modules: ['gbp'], linksText: '', monthlyAmount: '4250', termMonths: '' };
  it('passes a sane form', () => { expect(validateProposalForm(good).ok).toBe(true); });
  it('catches the things that would make a broken document', () => {
    expect(validateProposalForm({ ...good, title: 'ab' }).errors.title).toBeTruthy();
    expect(validateProposalForm({ ...good, locationsCount: 0 }).errors.locationsCount).toBeTruthy();
    expect(validateProposalForm({ ...good, locationsCount: 2.5 }).errors.locationsCount).toBeTruthy();
    expect(validateProposalForm({ ...good, modules: ['bogus'] }).errors.modules).toBeTruthy();
    expect(validateProposalForm({ ...good, linksText: 'ftp://x' }).errors.linksText).toMatch(/Not a link/);
    expect(validateProposalForm({ ...good, monthlyAmount: 'abc' }).errors.monthlyAmount).toBeTruthy();
    expect(validateProposalForm({ ...good, termMonths: '1.5' }).errors.termMonths).toBeTruthy();
  });
  it('warns (does not block) on a priceless or intro-less send', () => {
    expect(sendWarnings({ monthlyAmount: '', intro: '' })).toHaveLength(2);
    expect(sendWarnings({ monthlyAmount: '4250', intro: 'Hi' })).toHaveLength(0);
  });
});
