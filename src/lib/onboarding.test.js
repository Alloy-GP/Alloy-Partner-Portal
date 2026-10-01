import { describe, it, expect } from 'vitest';
import {
  TEMPLATE, SECTIONS, STATUSES, STATUS_VALUES, KINDS, templateRows, missingTemplateItems,
  isResolved, onboardingProgress, rowToItem, groupBySection, canSeeOnboarding,
  onboardingNavCount, shouldNudgeOnboarding, newCustomItem, nextSort, statusMeta, fieldsFor,
  derivePaymentStatus, applyPaymentStatus, onboardingOwnsPaymentNudge,
} from './onboarding.js';

const owner = { id: 'u1', role: 'owner', isStaff: false };
const acct = { id: 'a1' };
const item = (over = {}) => ({ id: 'x', section: 'access', key: 'k', label: 'L', kind: 'credential', status: 'pending', alloyStatus: null, fields: {}, custom: false, sort: 0, ...over });

describe('TEMPLATE integrity (the sheet, row for row)', () => {
  it('has unique stable keys', () => {
    const keys = TEMPLATE.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((k) => expect(k).toMatch(/^[a-z_]+$/));
  });
  it('only uses known sections and kinds', () => {
    const sections = new Set(SECTIONS.map((s) => s.id));
    TEMPLATE.forEach((t) => {
      expect(sections.has(t.section)).toBe(true);
      expect(Object.keys(KINDS)).toContain(t.kind);
      expect(t.label.trim().length).toBeGreaterThan(0);
    });
  });
  it('still lists every row the old sheet had', () => {
    const keys = TEMPLATE.map((t) => t.key);
    ['domain', 'hosting', 'cms', 'google_ads', 'gbp', 'ga', 'gsc', 'gtm', 'linkedin', 'instagram', 'youtube', 'facebook',
      'brand_guide', 'logos', 'media_library', 'proof', 'reports', 'crm', 'email_platform', 'tracking']
      .forEach((k) => expect(keys).toContain(k));
    // Contacts are client-added, never templated.
    expect(TEMPLATE.some((t) => t.section === 'contacts')).toBe(false);
  });
  it('adds the autopay bank step as a billing item with no typed fields', () => {
    const bank = TEMPLATE.find((t) => t.key === 'bank_account');
    expect(bank).toMatchObject({ section: 'billing', kind: 'payment' });
    expect(fieldsFor('payment')).toEqual([]);
    expect(SECTIONS.map((s) => s.id)).toEqual(['contacts', 'billing', 'access', 'resources', 'marketing']);
  });
  it('keeps the sheet’s status dropdown', () => {
    expect(STATUS_VALUES).toEqual(['pending', 'request_sent', 'complete', 'new_account', 'stuck', 'optional', 'na']);
    expect(STATUSES.every((s) => s.label && s.tone && s.help)).toBe(true);
  });
});

describe('templateRows', () => {
  it('materializes pending rows in template order, without an account_id', () => {
    const rows = templateRows();
    expect(rows.length).toBe(TEMPLATE.length);
    expect(rows[0]).toMatchObject({ key: 'bank_account', status: 'pending', custom: false, sort: 0, fields: {} });
    expect(rows[1].sort).toBe(10);
    rows.forEach((r) => expect(r.account_id).toBeUndefined());
  });
});

describe('missingTemplateItems', () => {
  it('returns the template entries an existing checklist lacks', () => {
    const have = templateRows().slice(0, -2);
    expect(missingTemplateItems(have).map((t) => t.key)).toEqual(TEMPLATE.slice(-2).map((t) => t.key));
    expect(missingTemplateItems(templateRows())).toEqual([]);
    expect(missingTemplateItems([]).length).toBe(TEMPLATE.length);
  });
});

describe('onboardingProgress', () => {
  it('counts resolved / stuck / confirmed over non-contact items only', () => {
    const items = [
      item({ key: 'a', status: 'complete', alloyStatus: 'complete' }),
      item({ key: 'b', status: 'na' }),
      item({ key: 'c', status: 'stuck' }),
      item({ key: 'd', status: 'request_sent' }),
      item({ key: 'e', section: 'contacts', kind: 'contact', status: 'pending' }),
    ];
    expect(onboardingProgress(items)).toEqual({ total: 4, resolved: 2, open: 2, stuck: 1, confirmed: 1, pct: 50 });
  });
  it('is zero-safe', () => {
    expect(onboardingProgress([])).toEqual({ total: 0, resolved: 0, open: 0, stuck: 0, confirmed: 0, pct: 0 });
    expect(onboardingProgress(undefined).pct).toBe(0);
  });
  it('treats new_account and optional as resolved for the client', () => {
    expect(isResolved('new_account')).toBe(true);
    expect(isResolved('optional')).toBe(true);
    expect(isResolved('request_sent')).toBe(false);
    expect(isResolved('stuck')).toBe(false);
  });
});

describe('rowToItem (the loadData seam)', () => {
  it('camelCases alloy_status / updated_by and defaults the rest', () => {
    const it = rowToItem({ id: '1', section: 'access', key: 'gbp', label: 'GBP', alloy_status: 'complete', updated_by: 'Bruce', sort: '30', fields: null });
    expect(it).toMatchObject({ id: '1', key: 'gbp', alloyStatus: 'complete', updatedBy: 'Bruce', sort: 30, fields: {}, status: 'pending', kind: 'credential', custom: false });
  });
});

describe('groupBySection', () => {
  it('buckets every section (empty arrays included) and sorts by sort then creation', () => {
    const g = groupBySection([
      item({ id: '2', sort: 20 }), item({ id: '1', sort: 10 }),
      item({ id: 'c2', section: 'contacts', sort: 0, createdAt: '2026-02-02' }),
      item({ id: 'c1', section: 'contacts', sort: 0, createdAt: '2026-01-01' }),
    ]);
    expect(Object.keys(g)).toEqual(['contacts', 'billing', 'access', 'resources', 'marketing']);
    expect(g.access.map((i) => i.id)).toEqual(['1', '2']);
    expect(g.contacts.map((i) => i.id)).toEqual(['c1', 'c2']);
    expect(g.resources).toEqual([]);
  });
});

describe('visibility gates', () => {
  const started = { startedAt: '2026-03-02T15:00:00Z', completedAt: null, items: [item(), item({ key: 'b', status: 'complete' })] };
  it('hides the page until Alloy starts a checklist', () => {
    expect(canSeeOnboarding(owner, acct, null)).toBe(false);
    expect(canSeeOnboarding(owner, acct, { items: [] })).toBe(false);
    expect(canSeeOnboarding(owner, acct, started)).toBe(true);
    expect(canSeeOnboarding(owner, acct, { startedAt: 'x', items: [] })).toBe(true);
    expect(canSeeOnboarding(owner, { ...acct, onboardingStartedAt: 'x' }, { items: [] })).toBe(true);
  });
  it('keeps accounting users (and nobody) away from credentials', () => {
    expect(canSeeOnboarding({ ...owner, role: 'accounting' }, acct, started)).toBe(false);
    expect(canSeeOnboarding(undefined, acct, started)).toBe(false);
    expect(canSeeOnboarding({ ...owner, role: 'staff' }, acct, started)).toBe(true);
    expect(canSeeOnboarding({ id: 's', role: 'staff', isStaff: true }, acct, started)).toBe(true);
  });
  it('badges open items until staff mark it complete', () => {
    expect(onboardingNavCount(started)).toBe(1);
    expect(onboardingNavCount({ ...started, completedAt: '2026-04-01' })).toBe(0);
    expect(onboardingNavCount(null)).toBe(0);
  });
  it('nudges on the dashboard only while there is work left', () => {
    expect(shouldNudgeOnboarding({ user: owner, account: acct, onboarding: started })).toBe(true);
    expect(shouldNudgeOnboarding({ user: owner, account: acct, onboarding: { ...started, completedAt: 'x' } })).toBe(false);
    expect(shouldNudgeOnboarding({ user: owner, account: acct, onboarding: { startedAt: 'x', items: [item({ status: 'complete' })] } })).toBe(false);
    expect(shouldNudgeOnboarding({ user: owner, account: acct, onboarding: { startedAt: 'x', items: [] } })).toBe(false);
    expect(shouldNudgeOnboarding({})).toBe(false);
  });
});

describe('custom rows', () => {
  it('picks the kind from the section and a unique custom key', () => {
    const c = newCustomItem({ accountId: 'a1', section: 'contacts', label: 'Pam', sort: 10 });
    expect(c).toMatchObject({ account_id: 'a1', section: 'contacts', kind: 'contact', custom: true, status: 'pending', sort: 10, label: 'Pam' });
    expect(c.key).toMatch(/^custom:/);
    expect(newCustomItem({ accountId: 'a1', section: 'marketing' }).kind).toBe('tool');
    expect(newCustomItem({ accountId: 'a1', section: 'resources' }).kind).toBe('upload');
    expect(newCustomItem({ section: 'contacts' }).key).not.toBe(newCustomItem({ section: 'contacts' }).key);
  });
  it('lands new rows at the bottom of their section', () => {
    const items = [item({ section: 'contacts', sort: 40 }), item({ section: 'access', sort: 190 })];
    expect(nextSort(items, 'contacts')).toBe(50);
    expect(nextSort(items, 'marketing')).toBe(10);
  });
});

describe('field specs', () => {
  it('maps kinds to inputs and falls back to credential', () => {
    expect(fieldsFor('contact').map((f) => f.k)).toEqual(['title', 'email', 'phone']);
    expect(fieldsFor('upload').map((f) => f.k)).toEqual(['link', 'notes']);
    expect(fieldsFor('nope')).toBe(KINDS.credential);
    expect(statusMeta('stuck').tone).toBe('pink');
    expect(statusMeta('bogus').value).toBe('pending');
  });
});

describe('bank step (kind payment)', () => {
  const bank = item({ key: 'bank_account', section: 'billing', kind: 'payment', status: 'pending' });
  it('derives complete from a bank on file, n/a from an autopay exemption, else stored', () => {
    expect(derivePaymentStatus(bank, { bankOnFile: true }).status).toBe('complete');
    expect(derivePaymentStatus(bank, { bankOnFile: false, autopayRequired: false }).status).toBe('na');
    expect(derivePaymentStatus(bank, { bankOnFile: false, autopayRequired: true })).toBe(bank);
    expect(derivePaymentStatus(bank, {})).toBe(bank);
    // a bank on file wins even if the account is exempt
    expect(derivePaymentStatus(bank, { bankOnFile: true, autopayRequired: false }).status).toBe('complete');
  });
  it('leaves every other kind alone', () => {
    const cred = item({ key: 'gbp', status: 'pending' });
    expect(derivePaymentStatus(cred, { bankOnFile: true })).toBe(cred);
    expect(applyPaymentStatus([cred, bank], { bankOnFile: true }).map((i) => i.status)).toEqual(['pending', 'complete']);
  });
  it('counts toward progress like any other item', () => {
    expect(onboardingProgress([bank]).open).toBe(1);
    expect(onboardingProgress(applyPaymentStatus([bank], { bankOnFile: true })).resolved).toBe(1);
  });
  it('owns the autopay nudge only while a checklist with the step is open', () => {
    expect(onboardingOwnsPaymentNudge({ startedAt: 'x', completedAt: null, items: [bank] })).toBe(true);
    expect(onboardingOwnsPaymentNudge({ startedAt: 'x', completedAt: '2026-10-01', items: [bank] })).toBe(false);
    expect(onboardingOwnsPaymentNudge({ startedAt: 'x', completedAt: null, items: [item()] })).toBe(false);
    expect(onboardingOwnsPaymentNudge({ startedAt: null, items: [] })).toBe(false);
    expect(onboardingOwnsPaymentNudge(null)).toBe(false);
  });
});
