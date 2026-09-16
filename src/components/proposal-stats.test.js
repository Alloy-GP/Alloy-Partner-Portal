import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalStats from './proposal-stats.jsx';

// Renders the real component to markup — proves the numbers proposalStats
// produces actually reach the DOM, and that a foreign account's rows leave no
// trace in what a client sees.

const CMGT = '5126f05a-c6b9-49c5-b9e3-364a2e2c76ad';
const OTHER = '11111111-2222-3333-4444-555555555555';

const row = (over = {}) => ({
  id: 'lead-' + Math.random().toString(36).slice(2),
  accountId: CMGT, community: 'Stonebridge',
  status: 'new', disq: false, openedAt: null, sentAt: null, archivedAt: null,
  tierId: 'full', perHome: 10, homes: 100, // $1,000/mo
  ...over,
});

// No default for accountId on purpose: one test passes `undefined` to prove the
// strip fails closed, and a default would silently turn that into a real account.
const render = (rows, accountId) => renderToStaticMarkup(React.createElement(ProposalStats, { rows, accountId }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('ProposalStats renders the strip', () => {
  it('shows the design mock shape: counts, bar segments, tiles and the sent split', () => {
    const rows = [
      row(), row(),                                                 // 2 New
      row({ openedAt: 'x' }),                                       // 1 Reviewed
      row({ status: 'sent', sentAt: 'x' }),                         // 1 Sent from portal
      ...Array.from({ length: 8 }, () => row({ status: 'sent' })),  // 8 Sent by hand
    ];
    const html = render(rows, CMGT);
    const t = text(html);
    expect(html).toContain('data-stat="open">12<');
    expect(t).toContain('2 New');
    expect(t).toContain('Unopened intake');
    expect(t).toContain('1 Reviewed');
    expect(t).toContain('Waiting to qualify');
    expect(t).toContain('9 Sent');
    expect(t).toContain('1 from portal · 8 by hand');
    // Build is 0 → no segment, no tile.
    expect(html).not.toContain('data-bucket="build"');
    expect(html).not.toContain('data-tile="build"');
    // Segment widths are shares of 12.
    expect(html).toContain('data-bucket="new" style="width:16.67%"');
    expect(html).toContain('data-bucket="reviewed" style="width:8.33%"');
    expect(html).toContain('data-bucket="sent" style="width:75%"');
    // Value: 9 sent × $1,000 = $9,000/mo; New/Reviewed add nothing.
    expect(html).toContain('data-stat="monthly">$9,000<small>/mo</small>');
    expect(t).toContain('$108k'); // annualized, compact
    expect(t).toContain('$1,000 /mo'); // average per qualified proposal
  });

  it('adds the Build segment and tile when something is being built', () => {
    const html = render([row({ status: 'review', perHome: 8.98, homes: 62 }), row({ status: 'sent', sentAt: 'x' })], CMGT);
    const t = text(html);
    expect(html).toContain('data-bucket="build" style="width:50%"');
    expect(t).toContain('1 Build');
    expect(t).toContain('Qualified · being built');
    expect(html).toContain('data-stat="monthly">$1,557<small>/mo</small>'); // 556.76 + 1000
  });

  it('renders an honest empty state: 0, $0/mo, no bar, no average', () => {
    const html = render([], CMGT);
    const t = text(html);
    expect(html).toContain('data-stat="open">0<');
    expect(html).not.toContain('fx-split');
    expect(t).toContain('Nothing open yet');
    expect(html).toContain('data-stat="monthly">$0<small>/mo</small>');
    expect(t).toContain('$0 Annualized');
    expect(t).toContain('— Average per qualified proposal');
  });

  it('leaves NO trace of another account\'s pipeline', () => {
    const mine = [row(), row({ status: 'sent', sentAt: 'x' })];
    const theirs = [
      row({ accountId: OTHER, status: 'review', perHome: 777, homes: 100, community: 'Foreign Towers' }), // $77,700/mo
      row({ accountId: OTHER }), row({ accountId: OTHER, openedAt: 'x' }),
    ];
    const mixed = render([...theirs, ...mine], CMGT);
    expect(mixed).toBe(render(mine, CMGT)); // byte-identical to rendering only my rows
    expect(mixed).toContain('data-stat="open">2<');
    expect(mixed).toContain('data-stat="monthly">$1,000<small>/mo</small>');
    expect(mixed).not.toContain('77,7');
    expect(mixed).not.toContain('data-bucket="build"');
    expect(mixed).not.toContain('Reviewed');
  });

  it('shows zeros, not the rows, when the viewed account id is missing in live data', () => {
    const html = render([row(), row({ status: 'sent', sentAt: 'x' })], undefined);
    expect(html).toContain('data-stat="open">0<');
    expect(html).toContain('data-stat="monthly">$0<small>/mo</small>');
  });
});
