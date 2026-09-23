// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { DATA } from '../data.js';
import { enrichLead } from '../lib/proposalMockData.js';
import { camFor } from '../lib/camProfiles.js';
import { CMGT_ACCOUNT_ID } from '../lib/proposalAccess.js';
import ProposalsScreen from './screen-proposals.jsx';

// The cockpit's scan/send animations. lottie_light probes a canvas context at
// import time and jsdom has none; the animation is not what this test is about.
vi.mock('lottie-web/build/player/lottie_light', () => ({ default: { loadAnimation: () => ({ destroy() {} }) } }));

// Mounts the REAL cockpit (mock-dev mode: no Supabase) and checks where the
// stats strip appears. The decision on 2026-09-16 was "stage list views only":
// inbox grid, Build bucket, Sent list, Won/Lost — never on a drilled-in lead,
// never on UVP Library or Archive. Each view decides for itself, so this is the
// one place that pins all seven outcomes together.

const act = React.act || TestUtils.act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const raw = (over = {}) => ({
  id: 'lead-' + Math.random().toString(36).slice(2),
  accountId: CMGT_ACCOUNT_ID,
  community: 'Stonebridge Condominiums', contact: 'Lauren McGinnis', contactRole: 'Board President', firstName: 'Lauren',
  city: 'Austin', homes: 62, status: 'new', priority: false, owner: 'AB', perHome: 8.98, received: 'Sep 1, 2026',
  email: 'l@example.com', phone: '', metaType: 'Condominiums', metaStatus: 'Self-managed', dues: '', engageTimeline: '', budget: '',
  selectedPains: ['transparency'], quote: '', disq: false, disqReason: '', linkExpires: '',
  tierId: 'full', notes: [], services: '', tierManual: false, amenities: '',
  boardToken: 'tok-' + Math.random().toString(36).slice(2), sentAt: null,
  receivedAt: '2026-09-01T10:00:00Z', arrivedAt: '2026-09-01T10:05:00Z',
  openedAt: null, openedBy: null, matchSnapshot: null, boardResponse: null, events: [],
  ...over,
});

const NEW_ID = 'lead-new-1', BUILD_ID = 'lead-build-1', SENT_ID = 'lead-sent-1';

let container, root;
const mount = async (url) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(ProposalsScreen)));
  });
  return container;
};
const strips = () => container.querySelectorAll('.fx-stats').length;

beforeAll(() => {
  const cam = camFor(CMGT_ACCOUNT_ID);
  DATA.account = { id: CMGT_ACCOUNT_ID, shortName: 'CMGT', company: 'CMGT' };
  DATA.user = { name: 'Test Staffer', initials: 'TS', role: 'owner', isStaff: true };
  DATA.team = [];
  DATA.archivedProposals = [];
  DATA.intakeSyncedAt = null;
  DATA.proposals = [
    raw({ id: NEW_ID }),
    raw({ id: 'lead-rev-1', openedAt: '2026-09-02T10:00:00Z', openedBy: 'Sam' }),
    raw({ id: BUILD_ID, status: 'review' }),
    raw({ id: SENT_ID, status: 'sent', sentAt: '2026-09-03T10:00:00Z' }),
    raw({ id: 'lead-won-1', status: 'accepted', salesValue: 7000 }),
  ].map((r) => enrichLead(r, cam));
  // jsdom has no layout; the stepper's pill measures offsets and gets zeros.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (container) container.remove();
  root = null; container = null;
});

describe('where the pipeline stats strip renders in the real cockpit', () => {
  it('New · inbox grid → one strip, above the headline', async () => {
    const c = await mount('/proposals?stage=new');
    expect(strips()).toBe(1);
    const strip = c.querySelector('.fx-stats');
    const head = c.querySelector('.fx-inbox-head');
    expect(head).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: the headline comes after the strip.
    expect(strip.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.querySelector('[data-stat="open"]').textContent).toBe('4'); // new + reviewed + build + sent; won excluded
  });

  it('New · drilled into a lead → no strip', async () => {
    await mount(`/proposals?stage=new&lead=${NEW_ID}`);
    expect(container.querySelector('.fx-back-row')).not.toBeNull(); // the drill-in toolbar is up
    expect(strips()).toBe(0);
  });

  it('Build · bucket list → one strip', async () => {
    await mount('/proposals?stage=build');
    expect(strips()).toBe(1);
    expect(container.querySelector('.fx-blist, .fx-empty')).not.toBeNull();
  });

  it('Build · editor for a focused lead → no strip', async () => {
    await mount(`/proposals?stage=build&lead=${BUILD_ID}`);
    expect(container.querySelector('.fx-back-row')).not.toBeNull();
    expect(strips()).toBe(0);
  });

  it('Sent · list → one strip', async () => {
    await mount('/proposals?stage=sent');
    expect(strips()).toBe(1);
  });

  it('Sent · focused on one proposal → no strip', async () => {
    await mount(`/proposals?stage=sent&lead=${SENT_ID}`);
    expect(container.querySelector('.fx-back-row')).not.toBeNull();
    expect(strips()).toBe(0);
  });

  it('Won / Lost → one strip', async () => {
    await mount('/proposals?stage=won');
    expect(strips()).toBe(1);
  });

  it('UVP Library and Archive → no strip', async () => {
    await mount('/proposals?stage=library');
    expect(strips()).toBe(0);
    await act(async () => root.unmount()); container.remove();
    await mount('/proposals?stage=archive');
    expect(strips()).toBe(0);
  });

  it('clicking the Build tile on the inbox lands on the Build bucket list, strip still showing', async () => {
    await mount('/proposals?stage=new');
    const tile = container.querySelector('.fx-stats [data-tile="build"]');
    expect(tile.tagName).toBe('BUTTON');
    await act(async () => { tile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('.fx-eyebrow').textContent).toContain('being built');
    expect(container.querySelector('.fx-blist')).not.toBeNull();   // the list, not the editor
    expect(container.querySelector('.fx-back-row')).toBeNull();
    expect(strips()).toBe(1);
  });

  it('clicking the Sent tile lands on the Sent list, not a focused proposal', async () => {
    await mount('/proposals?stage=won');
    const tile = container.querySelector('.fx-stats [data-tile="sent"]');
    expect(tile.tagName).toBe('BUTTON');
    await act(async () => { tile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('.fx-eyebrow').textContent).toContain('Live proposals');
    expect(container.querySelector('.fx-back-row')).toBeNull();
    expect(strips()).toBe(1);
  });

  it('New and Reviewed tiles are not links', async () => {
    await mount('/proposals?stage=build');
    expect(container.querySelector('.fx-stats [data-tile="new"]').tagName).toBe('DIV');
    expect(container.querySelector('.fx-stats [data-tile="reviewed"]').tagName).toBe('DIV');
  });

  it('the strip on screen is scoped to the viewed account (a foreign row in DATA never shows)', async () => {
    const cam = camFor(CMGT_ACCOUNT_ID);
    const saved = DATA.proposals;
    DATA.proposals = [
      ...saved,
      enrichLead(raw({ id: 'foreign-1', accountId: '11111111-2222-3333-4444-555555555555', status: 'review', perHome: 900, homes: 500 }), cam),
    ];
    try {
      await mount('/proposals?stage=new');
      const strip = container.querySelector('.fx-stats');
      expect(strip.querySelector('[data-stat="open"]').textContent).toBe('4');       // not 5
      expect(strip.querySelector('[data-tile="build"] .n').textContent).toBe('1 Build'); // not 2
      expect(strip.textContent).not.toContain('450,'); // the foreign $450,000/mo is nowhere
    } finally {
      DATA.proposals = saved;
    }
  });
});
