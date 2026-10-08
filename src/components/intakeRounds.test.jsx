// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Render smoke tests for the client intake round UI — the pieces a build can't
// vouch for. The quarterly workflow is a twin of the newsletter one and the
// admin tracker is ONE component (AdminIntakeRounds) under both, so this
// drives each surface with canned data and checks what a client / staffer
// would actually see: the prompts, the "nothing answered" guard, the submit
// hand-off, the tracker rows, the expanded submission, and the prompt-ticket
// panel (send as Sharlene, per-client recipient, the payload `open` receives).

const h = vi.hoisted(() => ({
  submitQuarterly: vi.fn(),
  openQuarterlyBooking: vi.fn(),
  listQuarterly: vi.fn(),
  openQuarterly: vi.fn(),
  listNewsletter: vi.fn(),
  prep: vi.fn(),
}));

vi.mock('../lib/quarterly.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, submitQuarterly: h.submitQuarterly, openQuarterlyBooking: h.openQuarterlyBooking };
});
vi.mock('../lib/admin.js', () => ({
  listQuarterlyRequests: h.listQuarterly,
  openQuarterlyRound: h.openQuarterly,
  closeQuarterlyRequest: vi.fn(),
  deleteQuarterlyRequest: vi.fn(),
  listNewsletterRequests: h.listNewsletter,
  openNewsletterRound: vi.fn(),
  closeNewsletterRequest: vi.fn(),
  deleteNewsletterRequest: vi.fn(),
  intakePrep: h.prep,
}));

import QuarterlyModal from './QuarterlyModal.jsx';
import QuarterlyBookButton from './QuarterlyBookButton.jsx';
import { DATA } from '../data.js';
import AdminQuarterly from './AdminQuarterly.jsx';
import AdminNewsletter from './AdminNewsletter.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  h.prep.mockResolvedValue(PREP);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllMocks();
});

const render = async (el) => { await act(async () => { root.render(el); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const type = async (el, value) => {
  await act(async () => {
    // React listens for the native input event via its value tracker.
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const select = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);
const pickBoxes = () => Array.from(container.querySelectorAll('input[type=checkbox][data-role=pick]'));
const buttonStarting = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim().startsWith(text));

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
    // Success step: thank-you + "Schedule the meeting"; Done hands the ticket id back.
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Thank you — we’ve got it.');
    expect(container.querySelector('textarea')).toBeNull();
    await click(buttonByText('Schedule the meeting'));
    expect(h.openQuarterlyBooking).toHaveBeenCalledWith(request);
    await click(buttonByText('Done'));
    expect(onSubmitted).toHaveBeenCalledWith('4321');
  });

  it('success step turns into "Meeting booked" when the client books in Cal\'s dialog', async () => {
    const saved = DATA.quarterlyRequest;
    DATA.quarterlyRequest = { ...request };
    h.submitQuarterly.mockResolvedValue({ ticketId: '1' });
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={() => {}} />);
    await type(container.querySelector('textarea'), 'A win');
    await click(buttonByText('Submit meeting prep'));
    expect(buttonByText('Schedule the meeting')).toBeTruthy();
    DATA.quarterlyRequest = { ...request, status: 'submitted', meetingAt: '2026-10-15T19:00:00Z' };
    await act(async () => { window.dispatchEvent(new Event('quarterly:changed')); });
    expect(buttonByText('Schedule the meeting')).toBeUndefined();
    expect(container.querySelector('[data-testid=quarterly-schedule]').textContent).toMatch(/Meeting booked · .*Oct 15/);
    DATA.quarterlyRequest = saved;
  });

  it('surfaces a submit failure inline', async () => {
    h.submitQuarterly.mockRejectedValue(new Error('Zendesk is down'));
    await render(<QuarterlyModal request={request} onClose={() => {}} onSubmitted={() => {}} />);
    await type(container.querySelector('textarea'), 'A win');
    await click(buttonByText('Submit meeting prep'));
    expect(container.querySelector('.nr-err').textContent).toBe('Zendesk is down');
  });
});

describe('QuarterlyBookButton (on the ticket, after the prep is in)', () => {
  const saved = DATA.quarterlyRequest;
  afterEach(() => { DATA.quarterlyRequest = saved; });

  it('renders only for a submitted round on a quarterly-tagged ticket, and opens Cal.com', async () => {
    DATA.quarterlyRequest = { id: 'qr-9', title: 'Q4 2026 Quarterly Meeting', status: 'submitted' };
    await render(<div><QuarterlyBookButton tags={['quarterly']} /><QuarterlyBookButton tags={['video']} variant="card" /></div>);
    const btns = Array.from(container.querySelectorAll('button'));
    expect(btns.map((b) => b.textContent.trim())).toEqual(['Schedule the meeting']);
    await click(btns[0]);
    expect(h.openQuarterlyBooking).toHaveBeenCalledWith(DATA.quarterlyRequest);
  });
  it('shows "Meeting booked" instead of the button once the round carries a meeting', async () => {
    DATA.quarterlyRequest = { id: 'qr-9', title: 'Q4', status: 'submitted', meetingAt: '2026-10-15T19:00:00Z' };
    await render(<div><QuarterlyBookButton tags={['quarterly']} /><QuarterlyBookButton tags={['quarterly']} variant="card" /></div>);
    expect(container.querySelector('button')).toBeNull();
    const chips = Array.from(container.querySelectorAll('[data-testid=quarterly-booked]'));
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toMatch(/Meeting booked · .*Oct 15/);
  });

  it('retires itself live when the booking lands while it is on screen', async () => {
    DATA.quarterlyRequest = { id: 'qr-9', title: 'Q4', status: 'submitted' };
    await render(<QuarterlyBookButton tags={['quarterly']} />);
    expect(container.querySelector('button').textContent).toContain('Schedule the meeting');
    DATA.quarterlyRequest = { ...DATA.quarterlyRequest, meetingAt: '2026-10-15T19:00:00Z' };
    await act(async () => { window.dispatchEvent(new Event('quarterly:changed')); });
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('Meeting booked');
  });

  it('renders nothing while the round is still open (the form button owns that state)', async () => {
    DATA.quarterlyRequest = { id: 'qr-9', title: 'Q4', status: 'open' };
    await render(<QuarterlyBookButton tags={['quarterly']} />);
    expect(container.querySelector('button')).toBeNull();
  });
});

const ACCOUNTS = [
  { id: 'a1', company: 'RISE Association Management', short_name: 'RISE' },
  { id: 'a2', company: 'Tidewater Property', short_name: 'Tidewater' },
  { id: 'a3', company: 'Happy CAM', short_name: 'Happy' }, // no Zendesk org
];

// What `intake_prep` returns: agents (Sharlene present but not first) and each
// org's users, owner first.
const PREP = {
  agents: [
    { id: '1', name: 'Justin', email: 'justin@alloygp.co' },
    { id: '2', name: 'Sharlene Smith', email: 'sharlene@alloygp.co' },
  ],
  defaultAgentId: '2',
  recipients: {
    a1: [{ id: '11', name: 'Rim', email: 'rim@rise.com', portalRole: 'member' }],
    a2: [
      { id: '22', name: 'Gail Windisch', email: 'gail@tidewater.com', portalRole: 'owner' },
      { id: '23', name: 'Ashley Renehan', email: 'ashley@tidewater.com', portalRole: 'member' },
    ],
  },
  defaults: { a1: '11', a2: '22' },
  errors: {},
};

describe('AdminQuarterly (AdminIntakeRounds)', () => {
  it('lists open / submitted rounds, blocks re-opening a live client, and expands a submission', async () => {
    h.listQuarterly.mockResolvedValue({
      accounts: ACCOUNTS.slice(0, 2),
      requests: [
        { id: 'r1', account_id: 'a1', title: 'Q4 2026 Quarterly Meeting', status: 'open', due_date: '2026-10-20',
          prompt_ticket_id: '640', prompt_meta: { requester_name: 'Rim', sender_name: 'Sharlene Smith', sent_at: '2026-10-07T18:00:00Z' },
          analytics: { opens: 2, openerCount: 1, openers: [{ name: 'Rim', count: 2 }], submits: 0 } },
        { id: 'r2', account_id: 'a2', title: 'Q4 2026 Quarterly Meeting', status: 'submitted', zendesk_ticket_id: '77',
          submitted_at: '2026-10-05T12:00:00Z', submitted_by: 'Kim',
          submission: { wins: 'Closed 3 boards', priorities: 'Grow leads 20%', attachments: ['deck.pdf'] },
          analytics: { opens: 1, openerCount: 1, openers: [{ name: 'Kim', count: 1 }], submits: 1 } },
      ],
    });
    await render(<AdminQuarterly />);
    expect(h.listQuarterly).toHaveBeenCalledTimes(1);
    expect(h.prep).toHaveBeenCalledTimes(1);

    const text = container.textContent;
    expect(text).toContain('Open a quarterly meeting round');
    expect(text).toContain('Waiting on the client · 1');
    expect(text).toContain('Submitted — ready for the meeting · 1');
    expect(text).toContain('Opened 2× · 1 person');
    expect(text).toContain('by Kim');
    // The prompt ticket chip links to Zendesk and names recipient + sender.
    const promptLink = Array.from(container.querySelectorAll('a')).find((a) => a.textContent.includes('Sent to Rim'));
    expect(promptLink.getAttribute('href')).toBe('https://alloycreatives.zendesk.com/agent/tickets/640');
    expect(promptLink.textContent).toContain('as Sharlene');

    // Both clients already have a live round → neither is selectable.
    const boxes = pickBoxes();
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
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent.trim().startsWith('Ticket'));
    expect(link.getAttribute('href')).toBe('https://alloycreatives.zendesk.com/agent/tickets/77');
  });

  it('shows the empty state when no rounds exist', async () => {
    h.listQuarterly.mockResolvedValue({ accounts: ACCOUNTS, requests: [] });
    await render(<AdminQuarterly />);
    expect(container.textContent).toContain('No quarterly meeting rounds yet');
    const boxes = pickBoxes();
    expect(boxes.length).toBe(3);
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });

  it('sends the prompt ticket as Sharlene to the picked recipient, with CCs and the edited message', async () => {
    h.listQuarterly.mockResolvedValue({ accounts: ACCOUNTS, requests: [] });
    h.openQuarterly.mockResolvedValue({ ok: true, opened: 2, skipped: 0, tickets: [
      { accountId: 'a2', ok: true, ticketId: '900', to: 'Gail Windisch', as: 'Sharlene Smith', cc: ['Ashley Renehan', 'skyler@alloygp.co'] },
      { accountId: 'a3', ok: false, error: 'no recipient picked' },
    ] });
    await render(<AdminQuarterly />);

    // Send-as defaults to Sharlene; subject + message start from the intake defaults.
    const sendAs = container.querySelector('select[aria-label="Send as"]');
    expect(sendAs.value).toBe('2');
    expect(container.querySelector('input[aria-label="Ticket subject"]').value).toBe('{title}: a few questions before we meet');
    expect(container.querySelector('textarea[aria-label="Ticket message"]').value).toContain('Hi {name},');

    // Pick Tidewater (has contacts) and Happy CAM (no Zendesk org).
    const boxes = pickBoxes();
    await click(boxes[1]); // a2
    await click(boxes[2]); // a3
    // Tidewater's recipient defaults to the portal owner.
    const to = container.querySelector('select[aria-label="Send to (Tidewater)"]');
    expect(to.value).toBe('22');
    expect(to.options[0].textContent).toContain('Gail Windisch · portal owner');
    // The other contact can be CC'd; the recipient is never offered as a CC.
    expect(container.querySelector('input[aria-label="CC Gail Windisch (Tidewater)"]')).toBeNull();
    await click(container.querySelector('input[aria-label="CC Ashley Renehan (Tidewater)"]'));
    await type(container.querySelector('input[aria-label="Also CC"]'), 'Skyler@alloygp.co, not-an-email');
    expect(container.textContent).toContain('No Zendesk org or contacts mapped');
    // Button counts tickets it can actually send.
    expect(buttonStarting('Open round for 2 clients').textContent).toContain('send 1 ticket');

    // Edit the message, preview it for Tidewater, then open.
    await type(container.querySelector('textarea[aria-label="Ticket message"]'), 'Hi {name}, quick one from {sender} about {title}.');
    await click(buttonStarting('Preview for Tidewater'));
    expect(container.querySelector('[data-testid=ticket-preview]').textContent).toContain('Hi Gail, quick one from Sharlene about Q');
    await click(buttonStarting('Open round for 2 clients'));

    expect(h.openQuarterly).toHaveBeenCalledTimes(1);
    const [ids, , due, ticket] = h.openQuarterly.mock.calls[0];
    expect(ids).toEqual(['a2', 'a3']);
    expect(due).toBeNull();
    expect(ticket).toEqual({
      send: true, senderId: '2',
      subject: '{title}: a few questions before we meet',
      message: 'Hi {name}, quick one from {sender} about {title}.',
      recipients: { a2: '22' }, // a3 has nobody to send to
      cc: { a2: ['23'] },
      ccEmails: ['skyler@alloygp.co'],
    });
    const notice = container.textContent;
    expect(notice).toContain('Opened for 2 clients.');
    expect(notice).toContain('#900 → Gail Windisch (as Sharlene) · cc Ashley Renehan, skyler@alloygp.co');
    expect(notice).toContain('⚠ Happy: ticket not sent — no recipient picked');
  });

  it('opens the round without a ticket when Zendesk prep fails', async () => {
    h.prep.mockRejectedValue(new Error('Zendesk 401: Couldn’t authenticate you'));
    h.listQuarterly.mockResolvedValue({ accounts: ACCOUNTS, requests: [] });
    h.openQuarterly.mockResolvedValue({ ok: true, opened: 1, skipped: 0, tickets: [] });
    await render(<AdminQuarterly />);
    expect(container.textContent).toContain('Couldn’t reach Zendesk');
    expect(container.querySelector('select[aria-label="Send as"]')).toBeNull();
    const boxes = pickBoxes();
    await click(boxes[0]);
    await click(buttonStarting('Open round for 1 client'));
    const [ids, , , ticket] = h.openQuarterly.mock.calls[0];
    expect(ids).toEqual(['a1']);
    expect(ticket).toBeNull();
  });
});

describe('AdminNewsletter still renders through the shared tracker', () => {
  it('keeps its own copy, ticket defaults and submission layout', async () => {
    h.listNewsletter.mockResolvedValue({
      accounts: ACCOUNTS.slice(0, 2),
      requests: [
        { id: 'n1', account_id: 'a1', title: 'October 2026 Newsletter', status: 'submitted',
          submission: { highlights: 'New community onboarded', events: 'Annual meeting Nov 3', attachments: [] },
          analytics: { opens: 0, openerCount: 0, openers: [], submits: 1 } },
      ],
    });
    await render(<AdminNewsletter />);
    expect(container.textContent).toContain('Open a newsletter round');
    expect(container.textContent).toContain('Submitted — ready to build · 1');
    expect(container.querySelector('input[aria-label="Ticket subject"]').value).toBe('{title}: what should we feature?');
    await click(buttonByText('View'));
    expect(container.textContent).toContain('This past month');
    expect(container.textContent).toContain('New community onboarded');
    expect(container.textContent).toContain('Annual meeting Nov 3');
    expect(container.textContent).not.toContain('Coming months');
  });
});
