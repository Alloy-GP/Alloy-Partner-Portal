// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import { DATA, applyData } from '../../data.js';
import { PLAN_TEMPLATES } from '../../lib/proposalPlans.js';
import ProposalPage from './ProposalPage.jsx';

// Mounts the REAL locked page (v3) on a stubbed DATA (no Supabase) and pins
// what each visitor sees and the acceptance mechanics: plan switching updates
// the money, the agreement must be confirmed before Accept unlocks, non-owners
// can't accept, staff preview can't, expired can't. Also a runtime smoke test.

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const engagement = (over = {}) => ({
  id: 'p1', status: 'sent', version: 2, sentAt: '2026-09-30T14:00:00Z', ref: 'CMGT-2026-02', validThrough: '2099-10-30',
  title: 'Growth partnership for CMGT.', locationsCount: 3,
  plans: PLAN_TEMPLATES, compareRows: {}, customRows: [], exclusivityMiles: 16,
  clientLegalName: 'Community Management, LLC', clientEntityType: 'Louisiana limited liability company', clientAddress: '140 Aspen Square, Denham Springs, LA',
  testimonialVimeoId: '1131397045', testimonialCaption: 'Client testimonial · 2:58', welcomeCallUrl: 'https://cal.com/alloy/welcome',
  preparedByName: 'Cameron Lange', preparedByPhone: '5555550100', preparedByEmail: 'cameron@alloygp.co', nextStepsTitle: '',
  monthlyAmount: 6850, setupAmount: 2500, startDate: '2026-11-01', termMonths: 12,
  referenceLinks: [{ label: 'Q2 2026 Impact Report', url: 'https://view.alloygp.co/cmgt/report/x.html' }],
  ...over,
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

describe('ProposalPage (v3)', () => {
  it('renders the whole document from the record + evergreen content', () => {
    const host = mount(owner);
    const t = host.textContent;
    expect(t).toContain('Growth partnership for CMGT.');
    expect(t).toContain('Questions? Text, call or email Cameron Lange.');
    expect(host.querySelector('[data-testid="pp-contact"] a[href="tel:+15555550100"]').textContent).toContain('(555) 555-0100');
    expect(host.querySelector('[data-testid="pp-contact"] a[href="mailto:cameron@alloygp.co"]')).toBeTruthy();
    // 01 — results block (no IntersectionObserver in jsdom → counted up already)
    expect(t).toContain('A plan to double your bottom line.');
    expect(host.querySelector('[data-testid="pp-result-plan"] .n').textContent).toBe('2×');
    expect(host.querySelector('[data-testid="pp-result-experience"] .n').textContent).toBe('6×+');
    expect(host.querySelector('[data-testid="pp-result-floor"] .n').textContent).toBe('1×');
    // 02 — baseline chips, programs, years, expertise, partner
    expect(host.querySelectorAll('[data-testid="pp-baseline"] .pp-cap')).toHaveLength(27); // 26 + "whatever your plan calls for"
    for (const k of ['reach', 'match', 'retain']) expect(host.querySelector(`[data-testid="pp-program-${k}"]`)).toBeTruthy();
    expect(host.querySelector('[data-testid="pp-program-reach"] .pr').textContent).toBe('(attract)');
    expect(t).toContain('Combined years inside community management.'); expect(t).toContain('Board psychology');
    expect(t).toContain('Alloy clients on Accelerate and Ascend are its preferred partners.');
    // 03 / 04 / sidebar
    expect(t).toContain('CMGT-2026-02'); expect(t).toContain('Valid through October 30, 2099');
    expect(t).toContain('Statement of investment'); expect(t).toContain('Prepared by'); expect(t).toContain('Cameron Lange · Alloy Growth Partners');
    expect(t).toContain('Say yes today. Boards find you before the new year.');
    expect(host.querySelector('[data-testid="pp-cta"]').textContent).toContain('Review terms and sign');
    expect(t).toContain('Q2 2026 Impact Report'); expect(host.querySelector('[data-testid="pp-testimonial"]').getAttribute('href')).toBe('https://vimeo.com/1131397045');
    // hard rules: no call tracking as a service, no em dashes in page copy
    expect(t).not.toMatch(/call tracking|recordings/i);
    expect(t).not.toContain('—');
  });

  it('defaults to the recommended plan; choosing another updates card, total, floor stat and agreement', () => {
    const host = mount(owner);
    expect(host.querySelector('[data-testid="pp-plan-accelerate"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="pp-accept"] .price b').textContent).toBe('$6,850');
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$9,350');
    expect(host.querySelector('[data-testid="pp-result-floor"].muted')).toBeNull();
    click(host.querySelector('[data-testid="pp-plan-ascend"]'));
    expect(host.querySelector('[data-testid="pp-plan-ascend"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="pp-accept"] .price b').textContent).toBe('$9,400');
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$11,900');
    click(host.querySelector('[data-testid="pp-plan-steady"]'));                      // no guarantee → floor + seal gray out
    expect(host.querySelector('[data-testid="pp-result-floor"].muted')).toBeTruthy();
    expect(host.querySelector('[data-testid="pp-guarantee"].muted')).toBeTruthy();
  });

  it('comparison grid: match HOA logo cell on partner plans, dash elsewhere; Every seat for the portal', () => {
    const host = mount(owner);
    const rows = [...host.querySelectorAll('[data-testid="pp-investment"] .pp-row')];
    const partner = rows.find((r) => r.textContent.includes('match HOA preferred partner'));
    expect(partner.querySelectorAll('.pp-cell')[0].querySelector('.pp-dash')).toBeTruthy();   // Steady
    expect(partner.querySelectorAll('.pp-cell')[1].querySelector('img.pp-logo-cell')).toBeTruthy(); // Accelerate
    const portal = rows.find((r) => r.textContent.includes('Growth Portal'));
    expect(portal.querySelectorAll('.pp-cell')[0].textContent).toBe('Every seat');
    expect(host.querySelectorAll('.pp-plan .fuel i')).toHaveLength(3);
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
    expect(modal.textContent).toContain('Alloy Growth Partners & Community Management, LLC Service Agreement');
    expect(modal.textContent).toContain('Alloy Growth Partners, LLC and Community Management, LLC');
    expect(modal.textContent).toContain('$6,850 per month');
    expect(modal.textContent).toContain('8.8 Growth Guarantee.');            // Accelerate includes it
    expect(modal.textContent).toContain('within 16 miles');
    expect(modal.textContent).toContain('Jeff Harman');                       // signer prefilled from the user
    expect(modal.textContent).toContain('For Alloy Growth Partners, LLC');
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
    click(host.querySelector('[data-testid="pp-plan-steady"]'));
    expect(host.querySelector('[data-testid="pp-accept-btn"]').disabled).toBe(true);
    click(host.querySelector('[data-testid="pp-read"]'));
    expect(host.querySelector('[data-testid="pp-agreement"]').textContent).not.toContain('8.8 Growth Guarantee.'); // Steady has none
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

  it('standalone export: no sign-out or user, accept routed to the portal, CTA and agreement still work', () => {
    const host = mount(owner, engagement(), { standalone: true });
    expect(host.querySelector('.pp-top-user')).toBeNull();
    expect(host.querySelector('[data-testid="pp-band"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-portal-note"]').textContent).toContain('Accepting happens in your Alloy Growth Portal');
    expect(host.querySelector('[data-testid="pp-cta"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pp-plan-ascend"]')).toBeTruthy();
  });

  it('expired: band replaced, no CTA, agreement read-only', () => {
    const host = mount(owner, engagement({ validThrough: '2020-01-01' }));
    expect(host.querySelector('[data-testid="pp-expired"]').textContent).toContain('This proposal has expired');
    expect(host.querySelector('[data-testid="pp-cta"]')).toBeNull();
    expect(host.textContent).toContain('Expired January 1, 2020');
  });

  it('section toggles hide blocks and renumber the nav; investment always shows', () => {
    const host = mount(owner, engagement({ sections: { results: false, programs: false, partner: false } }));
    expect(host.querySelector('[data-testid="pp-results"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-programs"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-partner"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-baseline"]')).toBeTruthy();
    const nav = [...host.querySelectorAll('.pp-nav-in a')].map((a) => a.textContent);
    expect(nav).toEqual(['01What to expect', '02Investment', '03Next steps']);
  });

  it('contact line adapts to what staff filled in; the headline override wins', () => {
    const host = mount(owner, engagement({ preparedByPhone: '', preparedByEmail: 'cameron@alloygp.co', nextStepsTitle: 'Say yes today. Boards find you by spring.' }));
    expect(host.textContent).toContain('Questions? Email Cameron Lange.');
    expect(host.querySelector('[data-testid="pp-contact"] a[href^="tel:"]')).toBeNull();
    expect(host.textContent).toContain('Boards find you by spring.');
  });

  it('single legacy plan: no chooser, no recommended tag, guarantee card hidden, no partner row', () => {
    const host = mount(owner, engagement({ plans: [{ key: 'plan', name: 'Growth plan', monthly: 4250, setup: 0, locations: 2, termMonths: 12, guarantee: false, exclusive: false, referralDiscount: 0, recommended: true }] }));
    expect(host.textContent).toContain('Your plan');
    expect(host.querySelector('.pp-plan .rec')).toBeNull();
    expect(host.querySelector('[data-testid="pp-guarantee"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-total"] .big').textContent).toBe('$4,250');
    expect(host.textContent).not.toContain('match HOA preferred partner');
  });

  it('no in-page chat: questions route to the rep; the sample modals open', () => {
    const host = mount(owner);
    expect(host.querySelector('[data-testid="pp-thread-card"]')).toBeNull();
    expect(host.querySelector('[data-testid="pp-next"] .q').textContent).toBe('Questions first? Text, call or email Cameron.');
    // section nav eases to its target (JS animation) and updates the hash
    window.scrollTo = vi.fn();
    click(host.querySelector('.pp-nav-in a[href="#s3"]'));
    expect(window.location.hash).toBe('#s3');
    expect(host.querySelectorAll('.pp-nav-in a.is-active')).toHaveLength(1);   // scroll spy marks one section current
    click(host.querySelector('[data-testid="pp-sample-roadmap"]'));
    let m = host.querySelector('[data-testid="pp-sample-modal"]');
    expect(m.textContent).toContain('Every quarter: plan, build, prove'); expect(m.textContent).toContain('Plan locks at Q3 review');
    click(m.querySelector('.x'));
    click(host.querySelector('[data-testid="pp-sample-casestudy"]'));
    m = host.querySelector('[data-testid="pp-sample-modal"]');
    expect(m.textContent).toContain('+41%'); expect(m.textContent).toContain('Q3 2026 playbook');
  });
});
