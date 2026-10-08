import { describe, it, expect } from 'vitest';
import { zendeskOrgOptions, orgUsage, NOT_CONNECTED } from './zendeskOrgs.js';

const ORGS = [
  { id: '5146158918043', name: 'Alloy' },
  { id: '49184676863259', name: 'CMGT' },
  { id: '5375789067163', name: 'RISE Association Management' },
];

describe('zendeskOrgOptions', () => {
  it('lists every org after "Not connected" and selects the saved one', () => {
    const r = zendeskOrgOptions(ORGS, '49184676863259');
    expect(r.value).toBe('49184676863259');
    expect(r.options[0]).toEqual({ value: NOT_CONNECTED, label: 'Not connected' });
    expect(r.options.map((o) => o.value)).toEqual(['', '5146158918043', '49184676863259', '5375789067163']);
    expect(r.options[2].label).toBe('CMGT · 49184676863259');
    expect(r.status).toEqual({ kind: 'ok', text: 'CMGT', name: 'CMGT' });
  });

  it('keeps an id that Zendesk no longer lists selectable, flagged, so a save does not drop it', () => {
    const r = zendeskOrgOptions(ORGS, '999');
    expect(r.value).toBe('999');
    expect(r.options[1]).toEqual({ value: '999', label: '999 · not found in Zendesk' });
    expect(r.status.kind).toBe('missing');
    expect(r.status.text).toContain('999');
  });

  it('keeps the saved id when the org list could not load', () => {
    const r = zendeskOrgOptions([], '49184676863259');
    expect(r.value).toBe('49184676863259');
    expect(r.options.map((o) => o.value)).toEqual(['', '49184676863259']);
    expect(r.status.kind).toBe('offline');
  });

  it('reports loading while the list is null, and "none" for an unmapped account', () => {
    expect(zendeskOrgOptions(null, '5146158918043').status.kind).toBe('loading');
    expect(zendeskOrgOptions(null, '5146158918043').options[1]).toEqual({ value: '5146158918043', label: '5146158918043' });
    expect(zendeskOrgOptions(ORGS, '').status.kind).toBe('none');
    expect(zendeskOrgOptions(ORGS, null).value).toBe('');
  });

  it('flags an org another client already uses', () => {
    const r = zendeskOrgOptions(ORGS, '5375789067163', { '5375789067163': 'Tidewater' });
    expect(r.options[3].label).toBe('RISE Association Management · 5375789067163 · used by Tidewater');
    expect(r.status.text).toBe('RISE Association Management — also used by Tidewater');
  });

  it('tolerates numeric ids and blank names', () => {
    const r = zendeskOrgOptions([{ id: 123, name: '' }], 123);
    expect(r.options[1]).toEqual({ value: '123', label: ' · 123' });
    expect(r.status.kind).toBe('ok');
  });
});

describe('orgUsage', () => {
  const ACCOUNTS = [
    { id: 'a1', short_name: 'RISE', zendesk_org_id: '5375789067163' },
    { id: 'a2', short_name: 'Tidewater', zendesk_org_id: '51488612294427' },
    { id: 'a3', company: 'Happy CAM', zendesk_org_id: null },
    { id: 'a4', short_name: 'Dup', zendesk_org_id: '5375789067163' },
  ];
  it('maps each org to the other accounts on it, skipping the account being edited', () => {
    expect(orgUsage(ACCOUNTS, 'a1')).toEqual({ '5375789067163': 'Dup', '51488612294427': 'Tidewater' });
    expect(orgUsage(ACCOUNTS, 'a9')).toEqual({ '5375789067163': 'RISE, Dup', '51488612294427': 'Tidewater' });
    expect(orgUsage([], 'a1')).toEqual({});
    expect(orgUsage(null, 'a1')).toEqual({});
  });
});
