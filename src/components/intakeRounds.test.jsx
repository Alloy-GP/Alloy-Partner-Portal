// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Render smoke tests for the client intake round UI — the pieces a build can't
// vouch for. The quarterly workflow is a twin of the newsletter one and the
// admin tracker is now ONE component (AdminIntakeRounds) under both, so this
// drives each surface with canned data and checks what a client / staffer
// would actually see: the prompts, the "nothing answered" guard, the submit
// hand-off, the tracker rows and the expanded submission.

const h = vi.hoisted(() => ({
  submitQuarterly: vi.fn(),
  listQuarterly: vi.fn(),
  listNewsletter: vi.fn(),
}));

vi.mock('../lib/quarterly.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, submitQuarterly: h.submitQuarterly };
});
vi.mock('../lib/admin.js', () => ({
  listQuarterlyRequests: h.listQuarterly,
  openQuarterlyRound: vi.fn(),
  closeQuarterlyRequest: vi.fn(),
  deleteQuarterlyRequest: vi.fn(),
  listNewsletterRequests: h.listNewsletter,
  openNewsletterRound: vi.fn(),
  closeNewsletterRequest: vi.fn(),
  deleteNewsletterRequest: vi.fn(),
}));

import QuarterlyModal from './QuarterlyModal.jsx';
import AdminQuarterly from './AdminQuarterly.jsx';
import AdminNewsletter from './AdminNewsletter.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllMocks();
});

const render = async (el) => { await act(async () => { root.render(el); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const type = async (textarea, value) => {
  await act(async () => {
    // React listens for the native input event via its value tracker.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

describe('QuarterlyModal', () => {
  const request = { id: 'qr-1', title: 'Q4 2026 Quarterly Meeting', status: 'open' };

  it('shows the round title and the five prompts, nothing pre-filled', async () => {
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={() => {}} />);
    expect(container.textContent).toContain('Q4 2026 Quarterly Meeting');
    const labels = Array.from(container.querySelectorAll('.nr-label')).map((l) => l.textContent);
    expect(labels).toEqual([
      'What went well last quarter?',
      'What didn’t go the way you hoped?',
      'Anything changed in the business?',
      'What matters most next quarter?',
      'Anything you want to make sure we cover when we meet?',
      'Attachments',
    ]);
    expect(container.querySelectorAll('textarea').length).toBe(5);
  });

  it('refuses an empty submission without calling submit', async () => {
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={() => {}} />);
    await click(buttonByText('Submit meeting prep'));
    expect(container.querySelector('.nr-err').textContent).toContain('Add at least one thing');
    expect(h.submitQuarterly).not.toHaveBeenCalled();
  });

  it('submits one answered prompt and hands the new ticket id back', async () => {
    h.submitQuarterly.mockResolvedValue({ ticketId: '4321' });
    const onSubmitted = vi.fn();
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={onSubmitted} />);
    const topics = container.querySelectorAll('textarea')[4];
    await type(topics, 'Budget for the annual meeting');
    await click(buttonByText('Submit meeting prep'));
    expect(h.submitQuarterly).toHaveBeenCalledTimes(1);
    const [requestId, form, files] = h.submitQuarterly.mock.calls[0];
    expect(requestId).toBe('qr-1');
    expect(form).toMatchObject({ topics: 'Budget for the annual meeting', wins: '' });
    expect(files).toEqual([]);
    expect(onSubmitted).toHaveBeenCalledWith('4321');
  });

  it('surfaces a submit failure inline', async () => {
    h.submitQuarterly.mockRejectedValue(new Error('Zendesk is down'));
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={() => {}} />);
    await type(container.querySelector('textarea'), 'A win');
    await click(buttonByText('Submit meeting prep'));
    expect(container.querySelector('.nr-err').textContent).toBe('Zendesk is down');
  });
});

const ACCOUNTS = [
  { id: 'a1', company: 'RISE Association Management', short_name: 'RISE' },
  { id: 'a2', company: 'Tidewater Property', short_name: 'Tidewater' },
];

describe('AdminQuarterly (AdminIntakeRounds)', () => {
  it('lists open / submitted rounds, blocks re-opening a live client, and expands a submission', async () => {
    h.listQuarterly.mockResolvedValue({
      accounts: ACCOUNTS,
      requests: [
        { id: 'r1', account_id: 'a1', title: 'Q4 2026 Quarterly Meeting', status: 'open', due_date: '2026-10-20',
          analytics: { opens: 2, openerCount: 1, openers: [{ name: 'Rim', count: 2 }], submits: 0 } },
        { id: 'r2', account_id: 'a2', title: 'Q4 2026 Quarterly Meeting', status: 'submitted', zendesk_ticket_id: '77',
          submitted_at: '2026-10-05T12:00:00Z', submitted_by: 'Kim',
          submission: { wins: 'Closed 3 boards', priorities: 'Grow leads 20%', attachments: ['deck.pdf'] },
          analytics: { opens: 1, openerCount: 1, openers: [{ name: 'Kim', count: 1 }], submits: 1 } },
      ],
    });
    await render(<AdminQuarterly />);
    expect(h.listQuarterly).toHaveBeenCalledTimes(1);

    const text = container.textContent;
    expect(text).toContain('Open a quarterly meeting round');
    expect(text).toContain('Waiting on the client · 1');
    expect(text).toContain('Submitted — ready for the meeting · 1');
    expect(text).toContain('Opened 2× · 1 person');
    expect(text).toContain('submitted');
    expect(text).toContain('by Kim');

    // Both clients already have a live round → neither is selectable.
    const boxes = Array.from(container.querySelectorAll('input[type=checkbox]'));
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.disabled)).toBe(true);

    // The default round title is the current calendar quarter.
    const titleInput = container.querySelector('input.input');
    expect(titleInput.value).toMatch(/^Q[1-4] \d{4} Quarterly Meeting$/);

    // Expand the submitted row: answers in form order, blank prompts skipped.
    const view = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'View');
    expect(view.length).toBe(2); // opener detail on r1, submission on r2
    await click(view[1]);
    const after = container.textContent;
    expect(after).toContain('Went well last quarter');
    expect(after).toContain('Closed 3 boards');
    expect(after).toContain('Priorities for next quarter');
    expect(after).not.toContain('Didn’t go as planned');
    expect(after).toContain('deck.pdf');
    // Ticket link points at the Zendesk agent view.
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent.includes('Ticket'));
    expect(link.getAttribute('href')).toBe('https://alloycreatives.zendesk.com/agent/tickets/77');
  });

  it('shows the empty state when no rounds exist', async () => {
    h.listQuarterly.mockResolvedValue({ accounts: ACCOUNTS, requests: [] });
    await render(<AdminQuarterly />);
    expect(container.textContent).toContain('No quarterly meeting rounds yet');
    const boxes = Array.from(container.querySelectorAll('input[type=checkbox]'));
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });
});

describe('AdminNewsletter still renders through the shared tracker', () => {
  it('keeps its own copy and submission layout', async () => {
    h.listNewsletter.mockResolvedValue({
      accounts: ACCOUNTS,
      requests: [
        { id: 'n1', account_id: 'a1', title: 'October 2026 Newsletter', status: 'submitted',
          submission: { highlights: 'New community onboarded', events: 'Annual meeting Nov 3', attachments: [] },
          analytics: { opens: 0, openerCount: 0, openers: [], submits: 1 } },
      ],
    });
    await render(<AdminNewsletter />);
    expect(container.textContent).toContain('Open a newsletter round');
    expect(container.textContent).toContain('Submitted — ready to build · 1');
    await click(buttonByText('View'));
    expect(container.textContent).toContain('This past month');
    expect(container.textContent).toContain('New community onboarded');
    expect(container.textContent).toContain('Annual meeting Nov 3');
    expect(container.textContent).not.toContain('Coming months');
  });
});
