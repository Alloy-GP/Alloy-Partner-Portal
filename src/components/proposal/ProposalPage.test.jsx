// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import { DATA, applyData } from '../../data.js';
import { PLAN_TEMPLATES } from '../../lib/proposalPlans.js';
import ProposalPage from './ProposalPage.jsx';

// Mounts the REAL locked page on a stubbed DATA (no Supabase) and pins what each
// visitor sees and the acceptance mechanics: plan switching updates the money,
// the agreement must be confirmed before Accept unlocks, non-owners can't
// accept, staff preview can't, expired can't. Also a runtime smoke test.

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const engagement = (over = {}) => ({
  id: 'p1', status: 'sent', version: 2, sentAt: '2026-09-30T14:00:00Z', ref: 'CMGT-2026-02', validThrough: '2099-10-30',
  title: 'Growth partnership for CMGT.', intro: 'Para one.\n\nPara two.', closing: 'See you at kickoff.',
  locationsCount: 3, modules: ['foundation', 'tracking', 'reporting', 'portal', 'website', 'gbp', 'lead-routing', 'review-program'],
  plans: PLAN_TEMPLATES, compareRows: {}, exclusivityMiles: 16, roiFeePerDoor: 14, roiDoorsPerCommunity: 150,
  clientLegalName: 'Community Management, LLC', clientEntityType: 'Louisiana limited liability company', clientAddress: '140 Aspen Square, Denham Springs, LA',
  testimonialVimeoId: '1131397045', testimonialCaption: 'Client testimonial · 2:58', welcomeCallUrl: 'https://cal.com/alloy/welcome', preparedByName: 'Skyler Nelson',
  monthlyAmount: 6850, setupAmount: 2500, startDate: '2026-11-01', termMonths: 12,
  referenceLinks: [{ label: 'Q3 Playbook', url: 'https://view.alloygp.co/cmgt/playbook/x.html' }],
  thread: [], ...over,
});

let mounted;
function mount(user, eng = engagement(), props = {}) {
  applyData({
    user, engagement: eng,
    account: { id: 'a1', company: 'Community Management, LLC', shortName: 'CMGT', locations: [{ name: 'Denham Springs, LA' }, { name: 'Biloxi, MS' }, { name: 'Lafayette, LA' }] },
    team: [{ name: 'Jeff Harman', role: 'owner', isStaff: false }],
  });
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<ProposalPage onSignOut={() => {}} onAccepted={() => {}} onExitPreview={() => {}} {...props} />); });
  mounted = { host, root };
  return host;
}
afterEach(() => { if (mounted) { act(() => mounted.root.unmount()); mounted.host.remove(); mounted = null; } });
const owner = { id: 'u1', name: 'Jeff Harman', email: 'jeff@cmgt.org', role: 'owner', isStaff: false };
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const type = (el, value) => act(() => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });

describe('ProposalPage', () => {
  it('renders the whole document from the record + evergreen content', () => {
    const host = mount(owner);
    const t = host.textContent;
    expect(t).toContain('Growth partnership for CMGT.');
    expect(t).toContain('Para one.'); expect(t).toContain('Para two.');
    expect(t).toContain('Denham Springs, LA'); expect(t).toContain('Lafayette, LA');
    expect(t).toContain('We know CAM'); expect(t).toContain('Board psychology');
    expect(host.querySelectorAll('[data-testid="pp-outcomes"] .pp-outcome')).toHaveLength(4);
    expect(t).toContain('Google Business Profile management');       // module → chip
    for (const k of ['journey', 'playbook', 'leads', 'reporting', 'you']) expect(host.querySelector(`[data-testid="pp-topic-${k}"]`)).toBeTruthy();
    expect(t).toContain('CMGT-2026-02'); expect(t).toContain('Valid through October 30, 2099');
    expect(t).toContain('Statement of investment'); expect(t).toContain('Prepared bySkyler Nelson');
    expect(t).toContain('Q3 Playbook');
    expect(t).toContain('Business days to first playbook'); expect(t).toContain('21');
    expect(t).not.toMatch(/call tracking|phone/i);                    // hard rule
  });

  it('defaults to the recommended plan; choosing another updates card, total and agreement', () => {
    const host = mount(owner);
    expect(host.querySelector('[data-testid="pp-plan-growth"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="pp-accept"] .price b').textContent).toBe('$6,850');
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$9,350');
    click(host.querySelector('[data-testid="pp-plan-scale"]'));
    expect(host.querySelector('[data-testid="pp-plan-scale"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="pp-accept"] .price b').textContent).toBe('$9,400');
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$11,900');
    expect(host.querySelector('[data-testid="pp-roi"] .big b').textContent).toBe('5'); // ceil(112800 / 25200)
  });

  it('accept unlocks only after the agreement is confirmed and a name is typed', () => {
    const host = mount(owner);
    click(host.querySelector('[data-testid="pp-band"]'));
    const btn = host.querySelector('[data-testid="pp-accept-btn"]');
    expect(btn.disabled).toBe(true);
    expect(host.textContent).toContain('Read the agreement to unlock.');
    click(host.querySelector('[data-testid="pp-read"]'));
    const modal = host.querySelector('[data-testid="pp-agreement"]');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Alloy Creatives & Community Management, LLC Service Agreement');
    expect(modal.textContent).toContain('$6,850 per month');
    expect(modal.textContent).toContain('8.8 Growth Guarantee.');            // Growth includes it
    expect(modal.textContent).toContain('Jeff Harman');                       // signer prefilled from the user
    click(host.querySelector('[data-testid="pp-agree"]'));
    expect(host.querySelector('[data-testid="pp-agreement"]')).toBeNull();
    expect(host.textContent).toContain('Confirmed · open again or download a PDF');
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(false);  // name prefilled
    type(host.querySelector('[data-testid="pp-name"]'), 'J');
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(true);
    expect(host.textContent).toContain('Add your name to unlock.');
  });

  it('switching plans after confirming re-requires reading (the contract changed)', () => {
    const host = mount(owner);
    click(host.querySelector('[data-testid="pp-band"]'));
    click(host.querySelector('[data-testid="pp-read"]')); click(host.querySelector('[data-testid="pp-agree"]'));
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(false);
    click(host.querySelector('[data-testid="pp-plan-core"]'));
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(true);
    click(host.querySelector('[data-testid="pp-read"]'));
    expect(host.querySelector('[data-testid="pp-agreement"]').textContent).not.toContain('8.8 Growth Guarantee.'); // Core has none
  });

  it('a non-owner client reads it but is told the owner accepts', () => {
    const host = mount({ ...owner, id: 'u2', name: 'Amanda', role: 'staff' });
    expect(host.querySelector('[data-testid="pp-band"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-owner-note"]').textContent).toContain('Your account owner (Jeff Harman) accepts on behalf of Community Management, LLC');
    expect(host.querySelector('[data-testid="pp-cta"]')).toBeNull();
  });

  it('staff preview: form usable, Accept locked, preview bar shown', () => {
    const host = mount({ ...owner, id: 's1', name: 'Skyler' }, engagement(), { previewOnly: true });
    expect(host.querySelector('.pp-preview-bar')).toBeTruthy();
    click(host.querySelector('[data-testid="pp-band"]'));
    click(host.querySelector('[data-testid="pp-read"]')); click(host.querySelector('[data-testid="pp-agree"]'));
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(true);
    expect(host.textContent).toContain('Staff preview.');
  });

  it('expired: band replaced, no CTA, agreement read-only', () => {
    const host = mount(owner, engagement({ validThrough: '2020-01-01' }));
    expect(host.querySelector('[data-testid="pp-expired"]').textContent).toContain('This proposal has expired');
    expect(host.querySelector('[data-testid="pp-cta"]')).toBeNull();
    expect(host.textContent).toContain('Expired January 1, 2020');
  });

  it('single legacy plan: no chooser, no recommended tag, guarantee card hidden', () => {
    const host = mount(owner, engagement({ plans: [{ key: 'plan', name: 'Growth plan', monthly: 4250, setup: 0, locations: 2, termMonths: 12, guarantee: false, exclusive: false, referralDiscount: 0, recommended: true }] }));
    expect(host.textContent).toContain('Your plan');
    expect(host.querySelector('.pp-plan .rec')).toBeNull();
    expect(host.querySelector('[data-testid="pp-guarantee"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$4,250');
  });

  it('thread renders and the topic modal opens with the market chips', () => {
    const host = mount(owner, engagement({ thread: [{ at: '2026-09-30T14:00:00Z', name: 'Jeff Harman', role: 'client', message: 'Can we start Dec 1?' }, { at: '2026-09-30T15:00:00Z', name: 'Skyler Nelson', role: 'staff', message: 'Done.' }] }));
    expect(host.querySelectorAll('[data-testid="eg-thread"] .eg-msg')).toHaveLength(2);
    click(host.querySelector('[data-testid="pp-topic-journey"]'));
    const m = host.querySelector('[data-testid="pp-topic-modal"]');
    expect(m.textContent).toContain('The five stages'); expect(m.textContent).toContain('Biloxi, MS');
  });
});
