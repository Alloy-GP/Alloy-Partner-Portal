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
  const state = { proposal: null, invites: [] };
  const builder = (table) => {
    const rowsFor = () => {
      if (table === 'engagement_proposals') return state.proposal ? [state.proposal] : [];
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
  plans: [{ key: 'core', name: 'Core', monthly: 3200, setup: 2500, locations: 1, termMonths: 12 }, { key: 'growth', name: 'Growth', monthly: 6850, setup: 2500, locations: 3, termMonths: 12, recommended: true, guarantee: true, exclusive: true, referralDiscount: 150 }],
  compare_rows: {}, sections: {}, markets: ['Denham Springs, LA', 'Biloxi, MS'], exclusivity_miles: 16, roi_fee_per_door: 14, roi_doors_per_community: 150,
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

  it('proposal tab (sent): status pill, sub-tabs, checklist, thread, re-send label; content toggles; agreement facts', async () => {
    h.state.proposal = sentRow;
    h.state.invites = [{ email: 'jeff@cmgt.org', role: 'owner', is_staff: false }];
    const host = await mount({ selectId: 'a1' });
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-status-pill"]').textContent).toContain('Sent · awaiting acceptance');
    expect(host.querySelector('[data-testid="adm-send"]').textContent).toBe('Save & re-send (v2)');
    expect(host.querySelector('[data-testid="adm-see"]').textContent).toContain('Growth plan · 3 locations');
    expect(host.querySelector('[data-testid="adm-see"]').textContent).toContain('$6,850');
    for (const k of ['markets', 'plan', 'legal', 'entity', 'start', 'owner']) expect(host.querySelector(`[data-testid="adm-check-${k}"]`).className).toBe('ok');
    expect(host.querySelector('[data-testid="adm-thread"]').textContent).toContain('Can we start Dec 1?');
    expect(host.querySelector('[data-testid="adm-roi-line"]').textContent).toContain('4 new communities a year covers the fee');
    expect(host.querySelectorAll('[data-testid="adm-markets"] .adm-chip.on')).toHaveLength(2);
    click(host.querySelector('[data-testid="adm-subtab-plans"]'));
    expect(host.querySelectorAll('.adm-plan')).toHaveLength(2);
    expect(host.querySelector('[data-testid="adm-plan-1-name"]').value).toBe('Growth');
    expect(host.querySelector('[data-testid="adm-plan-1"] .adm-plan-head').className).toContain('rec');
    click(host.querySelector('[data-testid="adm-subtab-content"]'));
    expect(host.querySelectorAll('[data-testid^="adm-section-"]')).toHaveLength(6);
    click(host.querySelector('[data-testid="adm-section-s2"] .sw'));
    expect(host.querySelector('[data-testid="adm-section-s2"]').className).toContain('off');
    click(host.querySelector('[data-testid="adm-subtab-agreement"]'));
    expect(host.textContent).toContain('Included (8.8)');
    expect(host.querySelector('[data-testid="adm-subtab-agreement"] .badge')).toBeNull();
  });

  it('proposal tab (draft, legal missing): agreement badge counts, checklist unchecked, send blocked with a reason', async () => {
    h.state.proposal = { ...sentRow, status: 'draft', sent_at: null, client_entity_type: null, client_address: null, markets: [] };
    const host = await mount({ selectId: 'a1' });
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-status-pill"]').textContent).toContain('Draft');
    expect(host.querySelector('[data-testid="adm-subtab-agreement"] .badge').textContent).toBe('2 missing');
    expect(host.querySelector('[data-testid="adm-check-markets"]').className).toBe('');
    expect(host.querySelector('[data-testid="adm-check-owner"]').className).toBe('');
    click(host.querySelector('[data-testid="adm-send"]'));
    await flush();
    expect(host.querySelector('[data-testid="adm-proposal-err"]').textContent).toMatch(/Before sending: markets selected, entity type & address/);
  });

  it('accepted: tab reads Plan, panel shows the signed plan, billing buttons are disabled', async () => {
    h.state.proposal = { ...sentRow, status: 'accepted', accepted_at: '2026-10-02T15:00:00Z', accepted_name: 'Jeff Harman', accepted_title: 'CEO', accepted_version: 1, accepted_plan_key: 'growth', agreement_hash: 'abc' };
    const host = await mount({ selectId: 'a1' });
    expect(host.querySelector('[data-testid="adm-tab-proposal"]').textContent).toContain('Plan');
    click(host.querySelector('[data-testid="adm-tab-proposal"]'));
    await flush();
    const panel = host.querySelector('[data-testid="adm-plan-panel"]');
    expect(panel.textContent).toContain('Active plan · accepted October 2, 2026');
    expect(panel.textContent).toContain('Growth'); expect(panel.textContent).toContain('$6,850');
    expect(host.textContent).toContain('Jeff Harman, CEO');
    const disabled = [...host.querySelectorAll('.adm-billing button')].map((b) => b.disabled);
    expect(disabled).toEqual([true, true]);
    expect(host.querySelector('[data-testid="adm-send"]')).toBeNull();
    expect(host.querySelector('.adm-rail .btn-p').textContent).toBe('Save plan changes');
  });
});
