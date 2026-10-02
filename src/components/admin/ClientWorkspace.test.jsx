// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';

// Mounts the REAL Manage Clients workspace against stubbed admin calls and a
// chainable Supabase stub (rows keyed by table). Pins the shape staff work in:
// header + tabs, the client list with proposal dots, each tab's key controls,
// and the proposal workspace (sub-tabs, checklist, rail) in draft, sent and
// accepted states. Also a runtime smoke test for every tab.

const h = vi.hoisted(() => {
  const state = { proposal: null, invites: [], onboardingItems: [] };
  const builder = (table) => {
    const rowsFor = () => {
      if (table === 'engagement_proposals') return state.proposal ? [state.proposal] : [];
      if (table === 'onboarding_items') return state.onboardingItems;
      return [];
    };
    const b = {
      select: () => b, eq: () => b, neq: () => b, in: () => b, or: () => b, like: () => b, order: () => b, limit: () => b, update: () => b, insert: () => b,
      maybeSingle: () => Promise.resolve({ data: rowsFor()[0] || null, error: null }),
      single: () => Promise.resolve({ data: rowsFor()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rowsFor(), error: null }).then(res, rej),
    };
    return b;
  };
  return { state, supabase: { from: (t) => builder(t), auth: { getUser: () => Promise.resolve({ data: { user: { id: 'staff-1' } } }) } } };
});
vi.mock('../../lib/supabase.js', () => ({ supabase: h.supabase, isSupabaseConfigured: true }));
vi.mock('../../lib/admin.js', () => ({
  listAccounts: () => Promise.resolve({ accounts: [
    { id: 'a1', company: 'Community Management, LLC', short_name: 'CMGT', tier: 'Accelerate', locations: [{ name: 'Denham Springs, LA', hq: true, tag: 'active', status: 'Page live' }, { name: 'Biloxi, MS', tag: 'onboarding' }], autopay_required: true, whatconverts_profile_id: '48211' },
    { id: 'a2', company: 'Edison Association Management', short_name: 'Edison', locations: [] },
  ] }),
  createAccount: vi.fn(), updateAccount: vi.fn(() => Promise.resolve({})), deleteAccount: vi.fn(), setDashConfig: vi.fn(() => Promise.resolve({})), uploadLogo: vi.fn(),
  listInvites: () => Promise.resolve({ invites: h.state.invites }),
  addInvite: vi.fn(), sendInvite: vi.fn(), removeInvite: vi.fn(),
  wcAccounts: () => Promise.resolve({ accounts: [{ id: 48211, name: 'CMGT' }] }),
}));
vi.mock('../../lib/engagement.js', () => ({ notifyProposalSent: vi.fn(), replyOnProposal: vi.fn(), acceptProposal: vi.fn(), requestProposalChanges: vi.fn() }));

import ClientWorkspace from './ClientWorkspace.jsx';

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async (n = 3) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

let mounted;
async function mount(props = {}) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<ClientWorkspace {...props} />); });
  await flush();
  mounted = { host, root };
  return host;
}
afterEach(() => { if (mounted) { act(() => mounted.root.unmount()); mounted.host.remove(); mounted = null; } h.state.proposal = null; h.state.invites = []; });

const sentRow = {
  id: 'p1', account_id: 'a1', status: 'sent', ref: 'CMGT-2026-01', version: 1, sent_at: '2026-09-30T14:00:00Z', valid_through: '2099-01-01', title: 'Growth partnership for CMGT.',
  plans: [{ key: 'steady', name: 'Steady', monthly: 3200, setup: 2500, locations: 1, termMonths: 12 }, { key: 'accelerate', name: 'Accelerate', monthly: 6850, setup: 2500, locations: 3, termMonths: 12, recommended: true, guarantee: true, exclusive: true, matchHoa: true, referralDiscount: 150 }],
  compare_rows: {}, sections: {}, markets: ['Denham Springs, LA', 'Biloxi, MS'], exclusivity_miles: 16, prepared_by_phone: '5555550100', prepared_by_email: 'cameron@alloygp.co',
  client_legal_name: 'Community Management, LLC', client_entity_type: 'Louisiana LLC', client_address: '140 Aspen Sq', start_date: '2026-11-01', valid_days: 30,
  change_requests: [{ at: '2026-09-30T15:00:00Z', name: 'Jeff', role: 'client', message: 'Can we start Dec 1?' }],
};

describe('ClientWorkspace', () => {
  it('header, tabs, client list with proposal dot; profile tab shows the account form', async () => {
    h.state.proposal = sentRow;
    const host = await mount({ selectId: 'a1' });
    expect(host.querySelector('.adm-who h1').textContent).toBe('Community Management, LLC');
    expect(host.querySelector('[data-testid="adm-save"]').textContent).toBe('Save changes');
    expect(host.querySelectorAll('.adm-client')).toHaveLength(2);
    expect(host.querySelector('.adm-client.on .s').textContent).toBe('CMGT');
    // sent proposal → pipeline section; no proposal → active clients
    expect([...host.querySelectorAll('.adm-list-sec')].map((e) => e.textContent)).toEqual(['In proposal1', 'Active clients1']);
    expect(host.querySelector('[data-testid="adm-group-proposal"] + .adm-client .s').textContent).toBe('CMGT');
    expect(host.querySelector('[data-testid="adm-tab-proposal"] .badge').textContent).toBe('Sent');
    expect(host.querySelector('[data-testid="adm-autopay-toggle"]').getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Goal on their dashboard');
  });

  it('locations tab lists rows with tags; integrations resolves the WhatConverts id; team tab invites', async () => {
    h.state.invites = [{ email: 'jeff@cmgt.org', name: 'Jeff Harman', role: 'owner', is_staff: false, emailed_at: '2026-09-30T10:00:00Z', last_seen_at: '2026-09-30T12:00:00Z' }];
    const host = await mount({ selectId: 'a1' });
    click(host.querySelector('[data-testid="adm-tab-locations"]'));
    expect(host.querySelectorAll('.adm-loc')).toHaveLength(2);
    expect(host.querySelector('[data-testid="adm-loc-0"]').textContent).toContain('HQ');
    expect(host.querySelector('[data-testid="adm-loc-1"] .pill').textContent).toBe('Onboarding');
    click(host.querySelector('[data-testid="adm-add-location"]'));
    expect(host.querySelector('[data-testid="adm-loc-edit-2"]')).toBeTruthy();
    click(host.querySelector('[data-testid="adm-tab-integrations"]'));
    await flush();
    expect(host.textContent).toContain('Connected systems');
    expect(host.textContent).toContain('48211');
    click(host.querySelector('[data-testid="adm-tab-team"]'));
    expect(host.querySelectorAll('[data-testid="adm-person"]')).toHaveLength(1);
    expect(host.textContent).toContain('Viewed Sep 30');
    expect(host.querySelector('[data-testid="adm-person"] .pill').textContent).toBe('Owner');
    expect(host.querySelector('[data-testid="adm-invite-add"]').textContent).toBe('Add & email');
  });

  it('credentials tab: empty state without a checklist; with rows lists contacts, locations and masked credentials', async () => {
    h.state.onboardingItems = [];
    const host = await mount();
    click(host.querySelector('[data-testid="adm-tab-credentials"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-cred-start"]')).not.toBeNull();

    h.state.onboardingItems = [
      { id: 'c1', account_id: 'a1', section: 'contacts', key: 'custom:c1', label: 'Bruce Crawford', kind: 'contact', status: 'pending', fields: { title: 'Owner', email: 'b@x.com', phone: '214.494.6002' }, custom: true, sort: 10 },
      { id: 'l1', account_id: 'a1', section: 'locations', key: 'loc:biloxi-ms', label: 'Biloxi, MS', kind: 'location', status: 'pending', fields: { address: '1 Beach Blvd, Biloxi, MS', phone: '228.555.0100', manager: 'Pam Andersen', hours: 'Mon–Fri 9–5', notes: 'Satellite · 3 staff' }, custom: true, sort: 10 },
      { id: 'g1', account_id: 'a1', section: 'access', key: 'cms', label: 'Website CMS login', kind: 'credential', status: 'complete', alloy_status: 'complete', fields: { username: 'b@x.com', password: 'hunter2', url: 'https://x.com/wp-admin' }, custom: false, sort: 30, updated_by: 'Bruce' },
      { id: 'p1', account_id: 'a1', section: 'billing', key: 'bank_account', label: 'Bank account for autopay', kind: 'payment', status: 'pending', fields: {}, custom: false, sort: 0 },
    ];
    const host2 = await mount();
    click(host2.querySelector('[data-testid="adm-tab-credentials"]'));
    await flush();
    expect(host2.querySelector('[data-testid="adm-cred-start"]')).toBeNull();
    expect(host2.querySelector('[data-testid="adm-cred-open"]').getAttribute('href')).toBe('/c/a1/onboarding');
    expect(host2.querySelector('[data-testid="adm-cred-contacts"]').textContent).toContain('Bruce Crawford');
    expect(host2.querySelector('[data-testid="adm-cred-locations"]').textContent).toContain('1 Beach Blvd');
    expect(host2.querySelector('[data-testid="adm-cred-locations"]').textContent).toContain('Pam Andersen');
    expect(host2.querySelector('[data-testid="adm-cred-locations"]').textContent).toContain('Satellite · 3 staff');
    const access = host2.querySelector('[data-testid="adm-cred-access"]');
    expect(access.textContent).toContain('Website CMS login');
    expect(access.textContent).toContain('Alloy: Complete');
    expect(access.textContent).not.toContain('hunter2');          // masked until "Show"
    expect(access.textContent).toContain('Last updated by Bruce');
    expect(host2.querySelector('[data-testid="adm-cred-billing"]').textContent).toContain('No bank account yet');
    h.state.onboardingItems = [];
  });

  it('proposal tab (sent): status pill, sub-tabs, checklist, thread, re-send label; content toggles; agreement facts', async () => {
    h.state.proposal = sentRow;
    h.state.invites = [{ email: 'jeff@cmgt.org', role: 'owner', is_staff: false }];
    const host = await mount({ selectId: 'a1' });
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-status-pill"]')).toBeNull();                 // status lives on the tab badge
    expect(host.querySelector('[data-testid="adm-save"]').textContent).toBe('Save');           // header Save = save without re-sending
    expect(host.querySelector('[data-testid="adm-send"]').textContent).toBe('Save & re-send (v2)');
    expect(host.querySelector('[data-testid="adm-see"]').textContent).toContain('Accelerate plan · 3 locations');
    expect(host.querySelector('[data-testid="adm-see"]').textContent).toContain('$6,850');
    for (const k of ['markets', 'plan', 'legal', 'entity', 'start', 'owner']) expect(host.querySelector(`[data-testid="adm-check-${k}"]`).className).toBe('ok');
    expect(host.querySelector('[data-testid="adm-thread"]').textContent).toContain('Can we start Dec 1?');
    expect(host.querySelector('[data-testid="adm-contact-phone"]').value).toBe('5555550100');          // v3 cover contact
    expect(host.querySelectorAll('[data-testid="adm-markets"] .adm-chip.on')).toHaveLength(2);
    click(host.querySelector('[data-testid="adm-subtab-plans"]'));
    expect(host.querySelectorAll('.adm-plan')).toHaveLength(2);
    expect(host.querySelector('[data-testid="adm-plan-1-name"]').value).toBe('Accelerate');
    expect(host.querySelector('[data-testid="adm-plan-1"] .adm-plan-head').className).toContain('rec');
    expect(host.querySelector('[data-testid="adm-plan-1-matchhoa"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="adm-plan-0-matchhoa"]').getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-testid="adm-plan-0-fuel"]')).toBeTruthy();
    click(host.querySelector('[data-testid="adm-custom-add"]'));
    expect(host.querySelector('[data-testid="adm-custom-0"]')).toBeTruthy();
    expect(host.querySelectorAll('[data-testid="adm-custom-0"] select')).toHaveLength(2); // one value editor per plan
    click(host.querySelector('[data-testid="adm-subtab-content"]'));
    expect(host.querySelectorAll('[data-testid^="adm-section-"]')).toHaveLength(6);
    click(host.querySelector('[data-testid="adm-section-programs"] .sw'));
    expect(host.querySelector('[data-testid="adm-section-programs"]').className).toContain('off');
    expect(host.querySelector('[data-testid="adm-next-title"]').getAttribute('placeholder')).toContain('Say yes today.');
    expect(host.querySelector('[data-testid="adm-outcomes"]')).toBeNull();                       // v3: no module picker
    click(host.querySelector('[data-testid="adm-subtab-agreement"]'));
    expect(host.textContent).toContain('Included (8.8)');
    expect(host.querySelector('[data-testid="adm-subtab-agreement"] .badge')).toBeNull();
  });

  it('proposal tab (draft, legal missing): agreement badge counts, checklist unchecked, send blocked with a reason', async () => {
    h.state.proposal = { ...sentRow, status: 'draft', sent_at: null, client_entity_type: null, client_address: null, markets: [] };
    const host = await mount({ selectId: 'a1' });
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-tab-proposal"] .badge').textContent).toBe('Draft');
    expect(host.querySelector('[data-testid="adm-subtab-agreement"] .badge').textContent).toBe('2 missing');
    expect(host.querySelector('[data-testid="adm-check-markets"]').className).toBe('');
    expect(host.querySelector('[data-testid="adm-check-owner"]').className).toBe('');
    click(host.querySelector('[data-testid="adm-send"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-proposal-err"]').textContent).toMatch(/Before sending: markets selected, entity type & address/);
    expect(host.querySelector('[data-testid="adm-feedback"]').textContent).toMatch(/Before sending/); // mirrored beside the header button
  });

  it('accepted: tab reads Plan, panel shows the signed plan, billing buttons are disabled', async () => {
    h.state.proposal = { ...sentRow, status: 'accepted', accepted_at: '2026-10-02T15:00:00Z', accepted_name: 'Jeff Harman', accepted_title: 'CEO', accepted_version: 1, accepted_plan_key: 'accelerate', agreement_hash: 'abc' };
    const host = await mount({ selectId: 'a1' });
    expect(host.querySelector('[data-testid="adm-tab-proposal"]').textContent).toContain('Plan');
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    const panel = host.querySelector('[data-testid="adm-plan-panel"]');
    expect(panel.textContent).toContain('Active plan · accepted October 2, 2026');
    expect(panel.textContent).toContain('Accelerate'); expect(panel.textContent).toContain('$6,850');
    expect(host.textContent).toContain('Jeff Harman, CEO');
    const disabled = [...host.querySelectorAll('.adm-billing button')].map((b) => b.disabled);
    expect(disabled).toEqual([true, true]);
    expect(host.querySelector('[data-testid="adm-send"]')).toBeNull();
    expect(host.querySelector('.adm-rail .btn-p')).toBeNull();                                  // header Save covers plan changes
    expect(host.querySelector('[data-testid="adm-save"]').textContent).toBe('Save');
  });
});
