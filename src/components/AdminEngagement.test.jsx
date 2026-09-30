// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';

// Mounts the REAL Admin authoring section against a canned engagement_proposals
// row (chainable Supabase stub, same shape as loadData.test.js) and pins the two
// states staff meet: no proposal yet → Create; a sent proposal → status strip,
// preview link, module toggles with the scaled lines, and the client's questions.

const h = vi.hoisted(() => {
  const state = { row: null };
  const builder = () => {
    const result = () => Promise.resolve({ data: state.row, error: null });
    const b = {
      select: () => b, eq: () => b, neq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      update: () => b, insert: () => b,
      maybeSingle: () => result(), single: () => result(),
      then: (res, rej) => result().then(res, rej),
    };
    return b;
  };
  return {
    state,
    supabase: { from: () => builder(), auth: { getUser: () => Promise.resolve({ data: { user: { id: 'staff-1' } } }) } },
  };
});
vi.mock('../lib/supabase.js', () => ({ supabase: h.supabase, isSupabaseConfigured: true }));

import AdminEngagement from './AdminEngagement.jsx';

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let mounted;
async function mount(row) {
  h.state.row = row;
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AdminEngagement accountId="a1" company="Community Management, LLC" locations={[{ name: 'Denham Springs' }, { name: 'Biloxi' }]} />); });
  await flush(); await flush();
  mounted = { host, root };
  return host;
}
afterEach(() => { if (mounted) { act(() => mounted.root.unmount()); mounted.host.remove(); mounted = null; } });

describe('AdminEngagement', () => {
  it('with no proposal: explains, offers Create, and the new draft is prefilled from the account', async () => {
    const host = await mount(null);
    expect(host.textContent).toContain('No proposal yet');
    const create = host.querySelector('[data-testid="admin-engagement-create"]');
    expect(create).toBeTruthy();
    act(() => { create.click(); });
    const form = host.querySelector('[data-testid="admin-engagement-form"]');
    expect(form).toBeTruthy();
    expect(form.querySelector('input').value).toBe('Growth partnership for Community Management, LLC');
    // the three standard tiers are prefilled, Growth recommended
    expect(host.querySelector('[data-testid="admin-plan-0-name"]').value).toBe('Core');
    expect(host.querySelector('[data-testid="admin-plan-1-name"]').value).toBe('Growth');
    expect(host.querySelector('[data-testid="admin-plan-2-name"]').value).toBe('Scale');
    expect(host.querySelector('[data-testid="admin-plan-1"] input[type="radio"]').checked).toBe(true);
    expect(host.querySelector('[data-testid="admin-plan-add"]')).toBeNull();                          // already 3
    expect(host.textContent).toContain('At Growth:');                                                    // ROI preview from the recommended plan
    expect(host.querySelector('[data-testid="admin-module-gbp"] input').checked).toBe(true);        // default set
    expect(host.querySelector('[data-testid="admin-module-video"] input').checked).toBe(false);
  });

  it('with a sent proposal: status strip, ref, validity, preview link, a legacy plan synthesised, and client questions', async () => {
    const host = await mount({
      id: 'p1', account_id: 'a1', status: 'sent', title: 'T', intro: '', closing: '', locations_count: 3, ref: 'CMA-2026-01', valid_through: '2099-01-01',
      modules: ['gbp', 'reporting'], monthly_amount: 4250, setup_amount: null, start_date: '2026-11-01', term_months: 12,
      reference_links: [{ label: 'Audit', url: 'https://view.alloygp.co/a.html' }], version: 2, sent_at: '2026-09-30T14:00:00Z',
      change_requests: [
        { at: '2026-09-30T15:00:00Z', name: 'Jeff Harman', email: 'jeff@cmgt.org', message: 'Can we start December 1?' },
        { at: '2026-09-30T15:30:00Z', name: 'Skyler Nelson', role: 'staff', message: 'Yes — moving it now.' },
      ],
    });
    const t = host.textContent;
    expect(t).toContain('Sent · portal locked until accepted');
    expect(t).toContain('v2'); expect(t).toContain('CMA-2026-01'); expect(t).toContain('valid through');
    expect(host.querySelector('a[href="/c/a1/?as=client"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="admin-module-gbp"] input').checked).toBe(true);
    // no plans on the row → one plan synthesised from the v1 summary columns
    expect(host.querySelector('[data-testid="admin-plan-0-name"]').value).toBe('Growth plan');
    expect(host.querySelector('[data-testid="admin-plan-1"]')).toBeNull();
    expect(host.querySelector('[data-testid="admin-module-video"] input').checked).toBe(false);
    expect(t).toContain('Can we start December 1?');
    expect(t).toContain('Yes — moving it now.');
    expect(host.querySelector('[data-testid="admin-engagement-thread"] .eg-msg.is-staff.is-mine')).toBeTruthy();
    expect(host.querySelector('[data-testid="admin-engagement-reply"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="admin-engagement-send"].btn').textContent).toContain('re-send (v+1)');
    expect(host.querySelector('[data-testid="admin-engagement-withdraw"]')).toBeTruthy();
    expect(host.querySelector('textarea[class*="input"]')).toBeTruthy();
    expect(host.textContent).toContain('Audit | https://view.alloygp.co/a.html');
  });

  it('with an accepted proposal: shows who accepted and hides Send', async () => {
    const host = await mount({
      id: 'p1', account_id: 'a1', status: 'accepted', title: 'T', locations_count: 1, modules: ['gbp'], version: 1,
      accepted_at: '2026-10-01T12:00:00Z', accepted_name: 'Jeff Harman', accepted_title: 'CEO', accepted_version: 1, agreement_version: 'v1',
    });
    expect(host.textContent).toContain('accepted by Jeff Harman (CEO)');
    expect(host.querySelector('[data-testid="admin-engagement-send"]')).toBeNull();
  });
});
