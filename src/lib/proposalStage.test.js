import { describe, it, expect } from 'vitest';
import {
  STAGE_TARGETS, STAGE_STATUS, STAGE_LABEL,
  stageOf, uiStageOf, inNew, inBuild, inSent, inWon, inLost,
  sentOutsidePortal, stageCols, stageMoves, stageNeeds,
  stageMovePatch, stageSnapshot, stageMoveLabel,
} from './proposalStage.js';

// A realistic enriched row: quoteValue is ANNUAL (enrichLead does perHome*homes*12).
const row = (over = {}) => ({
  id: '251234345', community: 'Stonebridge Condominiums', contact: 'Lauren McGinnis',
  status: 'new', disq: false, disqReason: '', owner: 'AB',
  perHome: 8.98, homes: 62, quoteValue: 6681, salesValue: null,
  sentAt: null, boardToken: 'tok', boardResponse: null, events: [],
  ...over,
});

// Enough opts to satisfy every target's `needs`.
const OPTS = { owner: 'JR', quoteValue: 6681, salesValue: 7200, disqReason: 'Outside service area' };

describe('stageOf — unchanged three-value vocabulary', () => {
  // screen-proposals.jsx imports this back; its bucket predicates and render
  // guards depend on exactly these three values.
  it('lets disq beat everything', () => {
    expect(stageOf({ disq: true, status: 'sent' })).toBe('closed');
    expect(stageOf({ disq: true, status: 'new' })).toBe('closed');
  });
  it('maps new -> pending, accepted/declined -> closed, rest -> qualified', () => {
    expect(stageOf({ status: 'new' })).toBe('pending');
    expect(stageOf({ status: 'accepted' })).toBe('closed');
    expect(stageOf({ status: 'declined' })).toBe('closed');
    expect(stageOf({ status: 'review' })).toBe('qualified');
    expect(stageOf({ status: 'draft' })).toBe('qualified');
    expect(stageOf({ status: 'sent' })).toBe('qualified');
  });
});

describe('uiStageOf', () => {
  it('resolves each stage, archived first', () => {
    expect(uiStageOf(row({ archivedAt: 'x' }))).toBe('archive');
    expect(uiStageOf(row({ disq: true }))).toBe('disq');
    expect(uiStageOf(row({ status: 'accepted' }))).toBe('won');
    expect(uiStageOf(row({ status: 'declined' }))).toBe('lost');
    expect(uiStageOf(row({ status: 'sent' }))).toBe('sent');
    expect(uiStageOf(row({ status: 'new' }))).toBe('new');
    expect(uiStageOf(row({ status: 'review' }))).toBe('build');
    expect(uiStageOf(row({ status: 'draft' }))).toBe('build');
  });
  it('never claims two stages at once', () => {
    // The contradictory shape the old partial patches could produce.
    expect(uiStageOf(row({ status: 'accepted', disq: true }))).toBe('disq');
  });
  it('is safe on nothing', () => expect(uiStageOf(null)).toBe(null));
});

describe('THE contract: every patch lands the row in exactly the target stage', () => {
  // The single strongest test in the file — it proves no patch leaves a
  // contradictory row, for every target, from every starting stage.
  const starts = [
    { name: 'new', over: { status: 'new' } },
    { name: 'build', over: { status: 'review' } },
    { name: 'sent', over: { status: 'sent', sentAt: '2026-08-11T19:43:47Z' } },
    { name: 'won', over: { status: 'accepted', salesValue: 5000 } },
    { name: 'lost', over: { status: 'declined' } },
    { name: 'disq', over: { status: 'new', disq: true, disqReason: 'Outside service area' } },
  ];
  for (const start of starts) {
    for (const target of STAGE_TARGETS) {
      if (start.name === target) continue;
      it(`${start.name} -> ${target}`, () => {
        const s = row(start.over);
        const { view, error } = stageMovePatch(s, target, OPTS);
        expect(error).toBeUndefined();
        const merged = { ...s, ...view };
        expect(uiStageOf(merged)).toBe(target);
        expect(merged.status).toBe(STAGE_STATUS[target]);
      });
    }
  }
});

describe('the complete stage tuple is always written', () => {
  it('sets disq/disqReason on exactly the disq target', () => {
    for (const t of STAGE_TARGETS) {
      const { cols } = stageMovePatch(row(), t, OPTS);
      expect(cols.disq).toBe(t === 'disq');
      expect(cols.disq_reason).toBe(t === 'disq' ? OPTS.disqReason : '');
    }
  });
  it('clears sales_value on every target but won', () => {
    for (const t of STAGE_TARGETS) {
      const { cols } = stageMovePatch(row({ salesValue: 9999 }), t, OPTS);
      expect(cols.sales_value).toBe(t === 'won' ? OPTS.salesValue : null);
    }
  });
  // markWon persisted only { status, sales_value } and never cleared disq, so
  // marking one of CMGT's three live disq rows Won put it in BOTH closed columns.
  it('reopening a real disq row to won leaves the Lost column', () => {
    const s = row({ status: 'new', disq: true, disqReason: 'Outside service area' });
    expect(inLost(s)).toBe(true);
    const { view } = stageMovePatch(s, 'won', OPTS);
    const merged = { ...s, ...view };
    expect(inWon(merged)).toBe(true);
    expect(inLost(merged)).toBe(false);
  });
  it('reopening a disq row to build leaves the Lost column', () => {
    const s = row({ status: 'new', disq: true, disqReason: 'Budget below our floor' });
    const { view } = stageMovePatch(s, 'build', OPTS);
    const merged = { ...s, ...view };
    expect(inLost(merged)).toBe(false);
    expect(inBuild(merged)).toBe(true);
  });
});

describe('cols is always derived from view', () => {
  it('matches stageCols(view) for every target', () => {
    for (const t of STAGE_TARGETS) {
      const { view, cols } = stageMovePatch(row(), t, OPTS);
      expect(cols).toEqual(stageCols(view));
    }
  });
  it('throws on an unmapped key rather than silently not saving it', () => {
    expect(() => stageCols({ nope: 1 })).toThrow(/no column mapped/);
  });
});

describe('fields a move must never touch', () => {
  const FORBIDDEN = [
    'sent_at', 'board_token', 'board_response', 'opened_at', 'opened_by',
    'link_expires', 'archived_at', 'archived_reason', 'archived_by', 'match_snapshot',
    'notes', 'per_home', 'received', 'source', 'tier_id', 'community',
  ];
  it('appear in no patch for any target', () => {
    for (const t of STAGE_TARGETS) {
      const { cols } = stageMovePatch(row({ sentAt: 'x', boardResponse: { action: 'changes' } }), t, OPTS);
      for (const f of FORBIDDEN) expect(cols).not.toHaveProperty(f);
    }
  });
  // Stonebridge carries 56 real proposal_events; board_token is NOT NULL + unique,
  // so rotating it would dead-link every email already sent.
  it('leaves events and the board token untouched on a demote', () => {
    const s = row({ status: 'sent', sentAt: '2026-08-11T19:43:47Z', events: [{ id: 1 }, { id: 2 }] });
    const { view } = stageMovePatch(s, 'new', OPTS);
    const merged = { ...s, ...view };
    expect(merged.events).toHaveLength(2);
    expect(merged.boardToken).toBe('tok');
    expect(merged.sentAt).toBe('2026-08-11T19:43:47Z');
  });
});

describe('required inputs refuse to half-apply', () => {
  it('won without a sales value returns an error and no patch', () => {
    const r = stageMovePatch(row(), 'won', {});
    expect(r.error).toBeTruthy();
    expect(r.view).toBeUndefined();
    expect(r.cols).toBeUndefined();
    expect(r.needs).toBe('salesValue');
  });
  it('disq without a reason returns an error and no patch', () => {
    const r = stageMovePatch(row(), 'disq', {});
    expect(r.error).toBeTruthy();
    expect(r.view).toBeUndefined();
    expect(r.needs).toBe('disqReason');
  });
  it('build with no quote anywhere returns an error', () => {
    const r = stageMovePatch(row({ quoteValue: undefined }), 'build', {});
    expect(r.error).toBeTruthy();
    expect(r.view).toBeUndefined();
  });
  it('build falls back to the row values when opts are absent', () => {
    const { view, error } = stageMovePatch(row({ owner: 'JR' }), 'build', {});
    expect(error).toBeUndefined();
    expect(view.owner).toBe('JR');
    expect(view.quoteValue).toBe(6681);
  });
  it('rejects an unknown target and an archived row', () => {
    expect(stageMovePatch(row(), 'nope').error).toBeTruthy();
    expect(stageMovePatch(row({ archivedAt: 'x' }), 'new').error).toBeTruthy();
  });
});

describe('quote value stays ANNUAL', () => {
  // proposals money is annual (enrichLead: perHome*homes*12); leads money is
  // monthly. The bug would be multiplying twice.
  it('carries the annual figure through without re-multiplying', () => {
    for (const t of ['build', 'sent', 'won']) {
      const { view } = stageMovePatch(row({ quoteValue: 6681 }), t, OPTS);
      expect(view.quoteValue).toBe(6681);
    }
  });
  it('omits quoteValue entirely for new / lost / disq', () => {
    for (const t of ['new', 'lost', 'disq']) {
      const { view } = stageMovePatch(row(), t, OPTS);
      expect(view).not.toHaveProperty('quoteValue');
    }
  });
  it('lets opts override for build', () => {
    const { view } = stageMovePatch(row(), 'build', { ...OPTS, quoteValue: 8000 });
    expect(view.quoteValue).toBe(8000);
  });
});

describe('sentOutsidePortal — the "not sent from here" marker', () => {
  it('is true only for Sent with no sent_at', () => {
    expect(sentOutsidePortal(row({ status: 'sent', sentAt: null }))).toBe(true);
    expect(sentOutsidePortal(row({ status: 'sent', sentAt: '2026-08-11T19:43:47Z' }))).toBe(false);
    expect(sentOutsidePortal(row({ status: 'new', sentAt: null }))).toBe(false);
    expect(sentOutsidePortal(null)).toBe(false);
  });
  // Marking Sent by hand must not invent a send date, or Close would fabricate
  // "sent Just now, 30 days left, awaiting first open" via freshWatch().
  it('a hand-marked Sent row gets no sent_at from the mover', () => {
    const { view, cols, warnings } = stageMovePatch(row({ status: 'new' }), 'sent', OPTS);
    expect(cols).not.toHaveProperty('sent_at');
    const merged = { ...row({ status: 'new' }), ...view };
    expect(sentOutsidePortal(merged)).toBe(true);
    expect(warnings.some((w) => w.code === 'notEmailed')).toBe(true);
  });
  it('re-promoting a genuinely sent row keeps it tracked, with no warning', () => {
    const s = row({ status: 'new', sentAt: '2026-08-11T19:43:47Z' });
    const { view, warnings } = stageMovePatch(s, 'sent', OPTS);
    const merged = { ...s, ...view };
    expect(sentOutsidePortal(merged)).toBe(false);
    expect(warnings.some((w) => w.code === 'notEmailed')).toBe(false);
  });
});

describe('stageMoves', () => {
  it('offers every stage except the current one, in rail order', () => {
    expect(stageMoves(row({ status: 'new' })).map((m) => m.id))
      .toEqual(['build', 'sent', 'won', 'lost', 'disq']);
    expect(stageMoves(row({ status: 'sent' })).map((m) => m.id))
      .toEqual(['new', 'build', 'won', 'lost', 'disq']);
  });
  it('offers Sent even when nothing was emailed (recording reality is allowed)', () => {
    expect(stageMoves(row({ status: 'new', sentAt: null })).map((m) => m.id)).toContain('sent');
  });
  it('offers nothing for an archived row', () => {
    expect(stageMoves(row({ archivedAt: 'x' }))).toEqual([]);
    expect(stageMoves(null)).toEqual([]);
  });
});

describe('warnings', () => {
  it('flags a live board link, a verdict, hidden events and a cleared signed value', () => {
    const s = row({
      status: 'sent', sentAt: '2026-08-11T19:43:47Z', boardToken: 'tok',
      boardResponse: { action: 'changes' }, events: [{ id: 1 }], salesValue: 4000,
    });
    const codes = stageMovePatch(s, 'new', OPTS).warnings.map((w) => w.code);
    expect(codes).toContain('boardLinkLive');
    expect(codes).toContain('boardVerdict');
    expect(codes).toContain('eventsHidden');
    expect(codes).toContain('clearsSalesValue');
  });
  it('carries the event count and verdict action for the copy', () => {
    const s = row({ status: 'sent', sentAt: 'x', events: [{}, {}, {}], boardResponse: { action: 'decline' } });
    const ws = stageMovePatch(s, 'build', OPTS).warnings;
    expect(ws.find((w) => w.code === 'eventsHidden').n).toBe(3);
    expect(ws.find((w) => w.code === 'boardVerdict').action).toBe('decline');
  });
  it('flags reopening a closed deal', () => {
    for (const over of [{ status: 'accepted' }, { status: 'declined' }, { disq: true }]) {
      const codes = stageMovePatch(row(over), 'build', OPTS).warnings.map((w) => w.code);
      expect(codes).toContain('reopensClosed');
    }
  });
  it('does not warn about Sent-only concerns when moving INTO Sent', () => {
    const s = row({ status: 'new', sentAt: 'x', boardToken: 'tok', events: [{}] });
    const codes = stageMovePatch(s, 'sent', OPTS).warnings.map((w) => w.code);
    expect(codes).not.toContain('boardLinkLive');
    expect(codes).not.toContain('eventsHidden');
  });
});

describe('nav — a move can never leave a focused view on the wrong row', () => {
  it('matches the table per target', () => {
    const nav = (t) => stageMovePatch(row(), t, OPTS).nav;
    expect(nav('new')).toEqual({ mode: 'new', inbox: false, focusBuild: false, watch: false, select: true });
    expect(nav('build')).toEqual({ mode: 'build', inbox: true, focusBuild: true, watch: false, select: true });
    expect(nav('sent')).toEqual({ mode: 'sent', inbox: true, focusBuild: false, watch: true, select: true });
    for (const t of ['won', 'lost', 'disq']) {
      expect(nav(t)).toEqual({ mode: 'won', inbox: true, focusBuild: false, watch: false, select: false });
    }
  });
  // Demoting off Sent must drop watchId, or CloseView renders a DIFFERENT
  // proposal's engagement while the toolbar still edits the moved one.
  it('never keeps watch when leaving Sent', () => {
    for (const t of ['new', 'build', 'won', 'lost', 'disq']) {
      expect(stageMovePatch(row({ status: 'sent', sentAt: 'x' }), t, OPTS).nav.watch).toBe(false);
    }
  });
});

describe('stageSnapshot — the Undo contract, by value', () => {
  it('round-trips a Sent row demoted to New', () => {
    const s = row({ status: 'sent', sentAt: '2026-08-11T19:43:47Z', owner: 'AB', quoteValue: 6681 });
    const before = stageSnapshot(s);
    const { view } = stageMovePatch(s, 'new', OPTS);
    const moved = { ...s, ...view };
    expect(uiStageOf(moved)).toBe('new');
    const undone = { ...moved, ...before.view };
    expect(uiStageOf(undone)).toBe('sent');
    expect(undone.status).toBe('sent');
    expect(undone.disq).toBe(false);
    expect(undone.salesValue).toBe(null);
    expect(undone.quoteValue).toBe(6681);
    expect(undone.owner).toBe('AB');
  });
  it('round-trips a disq row, reason included', () => {
    const s = row({ status: 'new', disq: true, disqReason: 'Outside service area' });
    const before = stageSnapshot(s);
    const { view } = stageMovePatch(s, 'build', OPTS);
    const undone = { ...s, ...view, ...before.view };
    expect(uiStageOf(undone)).toBe('disq');
    expect(undone.disqReason).toBe('Outside service area');
  });
  it('produces cols through the same single map', () => {
    const snap = stageSnapshot(row());
    expect(snap.cols).toEqual(stageCols(snap.view));
  });
});

describe('labels', () => {
  it('names each move the way the button should read', () => {
    expect(stageMoveLabel('won')).toBe('Mark won');
    expect(stageMoveLabel('lost')).toBe('Mark lost');
    expect(stageMoveLabel('disq')).toBe('Mark not a fit');
    expect(stageMoveLabel('sent')).toBe('Mark as sent');
    expect(stageMoveLabel('build')).toBe('Move to Build');
    expect(STAGE_LABEL.disq).toBe('Not a fit');
  });
  it('reports what each target needs', () => {
    expect(stageNeeds('build')).toBe('ownerQuote');
    expect(stageNeeds('won')).toBe('salesValue');
    expect(stageNeeds('disq')).toBe('disqReason');
    expect(stageNeeds('new')).toBe(null);
    expect(stageNeeds('sent')).toBe(null);
  });
});

describe('bucket predicates are single-source', () => {
  it('agree with uiStageOf', () => {
    expect(inNew(row({ status: 'new' }))).toBe(true);
    expect(inBuild(row({ status: 'review' }))).toBe(true);
    expect(inSent(row({ status: 'sent' }))).toBe(true);
    expect(inWon(row({ status: 'accepted' }))).toBe(true);
    expect(inLost(row({ status: 'declined' }))).toBe(true);
    expect(inLost(row({ disq: true }))).toBe(true);
    // a disq row is NOT also New, even though its status column still says 'new'
    expect(inNew(row({ status: 'new', disq: true }))).toBe(false);
  });
});
