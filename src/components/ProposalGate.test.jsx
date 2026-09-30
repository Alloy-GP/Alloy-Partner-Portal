// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import { DATA, applyData } from '../data.js';
import { DEFAULT_MODULES } from '../lib/engagementCatalog.js';
import ProposalGate from './ProposalGate.jsx';

// Mounts the REAL locked page on a stubbed DATA (no Supabase) and pins what
// each kind of visitor sees: the owner gets the Accept form, a non-owner gets
// the "your owner accepts" note, staff preview gets a disabled Accept. Also a
// runtime smoke test — a wrong prop or an unguarded deref throws here, not on
// a new client's first sign-in.

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const engagement = (over = {}) => ({
  id: 'p1', status: 'sent', version: 2, sentAt: '2026-09-30T14:00:00Z',
  title: 'Growth partnership for CMGT', intro: 'Para one.\n\nPara two.', closing: 'See you at kickoff.',
  locationsCount: 3, modules: [...DEFAULT_MODULES, 'proposal-system'],
  monthlyAmount: 6850, setupAmount: 2500, startDate: '2026-11-01', termMonths: 12,
  referenceLinks: [{ label: 'Q3 Playbook', url: 'https://view.alloygp.co/cmgt/playbook/x.html' }],
  thread: [], ...over,
});

function mount(user, eng = engagement(), props = {}) {
  applyData({
    user, engagement: eng,
    account: { id: 'a1', company: 'Community Management, LLC', shortName: 'CMGT', locations: [{ name: 'Denham Springs' }, { name: 'Biloxi' }, { name: 'Lafayette' }] },
    team: [{ name: 'Jeff Harman', role: 'owner', isStaff: false }],
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<ProposalGate onSignOut={() => {}} onAccepted={() => {}} onExitPreview={() => {}} {...props} />); });
  return { host, root };
}

let mounted;
beforeEach(() => { mounted = null; });
afterEach(() => { if (mounted) { act(() => mounted.root.unmount()); mounted.host.remove(); } });

const owner = { id: 'u1', name: 'Jeff Harman', email: 'jeff@cmgt.org', role: 'owner', isStaff: false };

describe('ProposalGate', () => {
  it('renders the document from DATA.engagement + the catalog, scaled to the locations', () => {
    mounted = mount(owner);
    const t = mounted.host.textContent;
    expect(t).toContain('Growth partnership for CMGT');
    expect(t).toContain('Para one.'); expect(t).toContain('Para two.');
    expect(t).toContain('Built for 3 locations');
    expect(t).toContain('3 profile managed weekly (1 × 3 locations)');   // gbp scaled
    expect(t).toContain('12 monthly reports / year');                       // flat stays flat
    expect(t).toContain('$6,850'); expect(t).toContain('$2,500'); expect(t).toContain('November 1, 2026'); expect(t).toContain('12 months');
    expect(t).toContain('Q3 Playbook');
    expect(t).toContain('See you at kickoff.');
    // every engine that has a module on gets a section
    for (const k of ['core', 'reach', 'match', 'retain']) expect(mounted.host.querySelector(`[data-testid="eg-engine-${k}"]`)).toBeTruthy();
  });

  it('owner sees the Accept form with the agreement naming the company and the money', () => {
    mounted = mount(owner);
    const btn = mounted.host.querySelector('[data-testid="eg-accept-btn"]');
    expect(btn).toBeTruthy(); expect(btn.disabled).toBe(false);
    expect(mounted.host.textContent).toContain('On behalf of Community Management, LLC, I accept this proposal at the monthly investment shown ($6,850/month, plus a one-time $2,500 setup)');
    expect(mounted.host.querySelector('input[autocomplete="name"]').value).toBe('Jeff Harman');
  });

  it('a non-owner client reads it but is told the owner accepts', () => {
    mounted = mount({ ...owner, id: 'u2', name: 'Amanda', role: 'staff' });
    expect(mounted.host.querySelector('[data-testid="eg-accept-btn"]')).toBeNull();
    expect(mounted.host.textContent).toContain('Your account owner (Jeff Harman) accepts on behalf of Community Management, LLC');
  });

  it('staff preview shows the form but Accept is disabled and the preview bar is on', () => {
    mounted = mount({ ...owner, id: 's1', name: 'Skyler', role: 'owner', isStaff: false }, engagement(), { previewOnly: true });
    const btn = mounted.host.querySelector('[data-testid="eg-accept-btn"]');
    expect(btn).toBeTruthy(); expect(btn.disabled).toBe(true);
    expect(mounted.host.textContent).toContain('Staff preview');
    expect(mounted.host.querySelector('.eg-preview-bar')).toBeTruthy();
  });

  it('renders the conversation with Alloy replies and the client’s own questions', () => {
    mounted = mount(owner, engagement({ thread: [
      { at: '2026-09-30T14:00:00Z', name: 'Jeff Harman', role: 'client', message: 'Can we start Dec 1?' },
      { at: '2026-09-30T15:00:00Z', name: 'Skyler Nelson', role: 'staff', message: 'Done — v2 starts Dec 1.' },
    ] }));
    const th = mounted.host.querySelector('[data-testid="eg-thread"]');
    expect(th).toBeTruthy();
    const msgs = [...th.querySelectorAll('.eg-msg')];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].className).toContain('is-client'); expect(msgs[0].className).toContain('is-mine');
    expect(msgs[1].className).toContain('is-staff'); expect(msgs[1].textContent).toContain('Skyler Nelson · Alloy');
    expect(th.textContent).toContain('Done — v2 starts Dec 1.');
  });

  it('survives a sparse proposal: no money, no links, no intro, one location', () => {
    mounted = mount(owner, engagement({ monthlyAmount: null, setupAmount: null, referenceLinks: [], intro: '', closing: '', locationsCount: 1, startDate: null, termMonths: null, title: '' }));
    const t = mounted.host.textContent;
    expect(t).toContain('Growth partnership for Community Management, LLC'); // title fallback
    expect(t).toContain('Investment to be confirmed');
    expect(t).toContain('Built for 1 location');
    expect(t).not.toContain('× 1 locations');
    expect(mounted.host.querySelector('[data-testid="eg-refs"]')).toBeNull();
  });
});
