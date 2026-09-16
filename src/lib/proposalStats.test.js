import { describe, it, expect } from 'vitest';
import {
  OPEN_BUCKETS, VALUED_BUCKETS,
  openBucketOf, belongsTo, monthlyValueOf, proposalStats,
  fmtWhole, fmtCompact, sentSplitLabel,
} from './proposalStats.js';
import { uiStageOf } from './proposalStage.js';
import { pricing } from './proposalMockData.js';

const CMGT = '5126f05a-c6b9-49c5-b9e3-364a2e2c76ad';
const OTHER = '11111111-2222-3333-4444-555555555555';

// A plain pipeline row as the cockpit holds it. Full-service tier, 100 homes at
// $10/home → $1,000/mo, comfortably above the $250 floor, so value math is legible.
const row = (over = {}) => ({
  id: 'lead-' + Math.random().toString(36).slice(2),
  accountId: CMGT,
  status: 'new', disq: false, openedAt: null, sentAt: null, archivedAt: null,
  tierId: 'full', perHome: 10, homes: 100,
  ...over,
});
const fresh = (o) => row({ status: 'new', openedAt: null, ...o });
const reviewed = (o) => row({ status: 'new', openedAt: '2026-09-01T10:00:00Z', ...o });
const build = (o) => row({ status: 'review', ...o });
const sentPortal = (o) => row({ status: 'sent', sentAt: '2026-09-02T10:00:00Z', ...o });
const sentHand = (o) => row({ status: 'sent', sentAt: null, ...o });
const won = (o) => row({ status: 'accepted', ...o });
const lost = (o) => row({ status: 'declined', ...o });
const disq = (o) => row({ status: 'declined', disq: true, ...o });

const stats = (rows, accountId = CMGT) => proposalStats(rows, { accountId });

// ─────────────────────────────────────────────────────────────────────────────
describe('tenancy — the numbers are the viewed account\'s and nobody else\'s', () => {
  it('drops every row from another account, counting and valuing none of it', () => {
    const mine = [fresh(), build(), sentPortal()];
    const theirs = [
      fresh({ accountId: OTHER }), reviewed({ accountId: OTHER }), build({ accountId: OTHER, perHome: 1000 }),
      sentPortal({ accountId: OTHER, perHome: 1000 }), sentHand({ accountId: OTHER }), won({ accountId: OTHER }),
    ];
    const s = stats([...theirs, ...mine, ...theirs]);
    expect(s.open).toBe(3);
    expect(s.counts).toEqual({ new: 1, reviewed: 0, build: 1, sent: 1 });
    expect(s.value.monthly).toBe(2000); // build + sent, $1,000 each; the $100k rows never touched it
    expect(s.value.count).toBe(2);
    expect(s.excluded.foreign).toBe(theirs.length * 2);
  });

  it('is identical to computing over the account\'s own rows alone', () => {
    const mine = [fresh(), reviewed(), build(), sentPortal(), sentHand(), won(), lost()];
    const theirs = [fresh({ accountId: OTHER }), sentPortal({ accountId: OTHER, perHome: 500 })];
    const a = stats(mine);
    const b = stats([...mine, ...theirs]);
    expect(b.open).toBe(a.open);
    expect(b.counts).toEqual(a.counts);
    expect(b.segments).toEqual(a.segments);
    expect(b.value).toEqual(a.value);
    expect(b.sentPortal).toBe(a.sentPortal);
    expect(b.sentHand).toBe(a.sentHand);
  });

  it('fails CLOSED when the caller passes no account id in live mode: every real row is foreign', () => {
    const s = proposalStats([fresh(), build(), sentPortal()], {});
    expect(s.open).toBe(0);
    expect(s.value.monthly).toBe(0);
    expect(s.excluded.foreign).toBe(3);
  });

  it('drops a row that carries no account id when a real account is being viewed', () => {
    const s = stats([fresh({ accountId: undefined }), build({ accountId: null }), sentPortal()]);
    expect(s.open).toBe(1);
    expect(s.counts.sent).toBe(1);
    expect(s.excluded.foreign).toBe(2);
  });

  it('mock dev (no account anywhere) still counts: null and undefined are the same "no account"', () => {
    const s = proposalStats([fresh({ accountId: undefined }), build({ accountId: null })], { accountId: undefined });
    expect(s.open).toBe(2);
    expect(s.excluded.foreign).toBe(0);
  });

  it('belongsTo is strict about a real id on either side', () => {
    expect(belongsTo({ accountId: CMGT }, CMGT)).toBe(true);
    expect(belongsTo({ accountId: OTHER }, CMGT)).toBe(false);
    expect(belongsTo({ accountId: CMGT }, undefined)).toBe(false);
    expect(belongsTo({}, CMGT)).toBe(false);
    expect(belongsTo({}, undefined)).toBe(true);
    expect(belongsTo({ accountId: null }, null)).toBe(true);
    expect(belongsTo(null, CMGT)).toBe(false);
  });

  it('tolerates a non-array rows argument', () => {
    expect(stats(undefined).open).toBe(0);
    expect(stats(null).open).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('openBucketOf — one bucket per row, agreeing with the rail', () => {
  it('maps each open state to exactly one bucket', () => {
    expect(openBucketOf(fresh())).toBe('new');
    expect(openBucketOf(reviewed())).toBe('reviewed');
    expect(openBucketOf(build())).toBe('build');
    expect(openBucketOf(build({ status: 'draft' }))).toBe('build');
    expect(openBucketOf(sentPortal())).toBe('sent');
    expect(openBucketOf(sentHand())).toBe('sent');
  });

  it('puts every closed state in no bucket', () => {
    expect(openBucketOf(won())).toBeNull();
    expect(openBucketOf(lost())).toBeNull();
    expect(openBucketOf(disq())).toBeNull();
    expect(openBucketOf(disq({ status: 'new' }))).toBeNull();     // disq beats status, like uiStageOf
    expect(openBucketOf(disq({ status: 'sent' }))).toBeNull();
    expect(openBucketOf(sentPortal({ archivedAt: '2026-09-03T00:00:00Z' }))).toBeNull(); // archive beats everything
    expect(openBucketOf(null)).toBeNull();
    expect(openBucketOf(undefined)).toBeNull();
  });

  it('only a NEW row can be "reviewed" — openedAt on a later stage does not demote it', () => {
    expect(openBucketOf(build({ openedAt: 'x' }))).toBe('build');
    expect(openBucketOf(sentPortal({ openedAt: 'x' }))).toBe('sent');
    expect(openBucketOf(won({ openedAt: 'x' }))).toBeNull();
  });

  it('never contradicts uiStageOf for any status / disq / opened / archived combination', () => {
    const statuses = ['new', 'review', 'draft', 'sent', 'accepted', 'declined'];
    for (const status of statuses) for (const d of [false, true]) for (const opened of [null, 'x']) for (const arch of [null, 'x']) {
      const r = row({ status, disq: d, openedAt: opened, archivedAt: arch });
      const bucket = openBucketOf(r);
      const st = uiStageOf(r);
      if (st === 'new') expect(bucket).toBe(opened ? 'reviewed' : 'new');
      else if (st === 'build' || st === 'sent') expect(bucket).toBe(st);
      else expect(bucket).toBeNull();
      expect(bucket === null || OPEN_BUCKETS.includes(bucket)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('counts, segments and the sent split', () => {
  it('reproduces the design mock: 2 new + 1 reviewed + 9 sent = 12 open', () => {
    const rows = [
      fresh(), fresh(), reviewed(),
      sentPortal(), ...Array.from({ length: 8 }, () => sentHand()),
    ];
    const s = stats(rows);
    expect(s.open).toBe(12);
    expect(s.counts).toEqual({ new: 2, reviewed: 1, build: 0, sent: 9 });
    expect(s.sentPortal).toBe(1);
    expect(s.sentHand).toBe(8);
    expect(sentSplitLabel(s)).toBe('1 from portal · 8 by hand');
    expect(s.segments.map((x) => x.id)).toEqual(['new', 'reviewed', 'sent']); // build hidden at 0
    expect(s.segments.map((x) => Math.round(x.pct * 10) / 10)).toEqual([16.7, 8.3, 75]);
  });

  it('adds a Build segment when anything is being built', () => {
    const s = stats([fresh(), build(), build(), sentPortal()]);
    expect(s.segments.map((x) => [x.id, x.count, x.pct])).toEqual([['new', 1, 25], ['build', 2, 50], ['sent', 1, 25]]);
  });

  it('segments cover only non-zero buckets, keep rail order, and their shares sum to 100', () => {
    const s = stats([sentHand(), reviewed(), sentPortal(), fresh(), build()]);
    expect(s.segments.map((x) => x.id)).toEqual(OPEN_BUCKETS);
    expect(s.segments.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 9);
    expect(s.segments.every((x) => x.count > 0)).toBe(true);
  });

  it('closed rows count nowhere, but are reported as excluded', () => {
    const s = stats([won(), lost(), disq(), fresh()]);
    expect(s.open).toBe(1);
    expect(s.excluded.closed).toBe(3);
  });

  it('archived rows count nowhere even when their status is open', () => {
    const s = stats([sentPortal({ archivedAt: 'x' }), fresh({ archivedAt: 'x' }), build()]);
    expect(s.open).toBe(1);
    expect(s.excluded.archived).toBe(2);
    expect(s.value.monthly).toBe(1000); // the archived sent row's $1,000 is not in here
  });

  it('an empty pipeline is all zeros with no segments and no average', () => {
    const s = stats([]);
    expect(s.open).toBe(0);
    expect(s.segments).toEqual([]);
    expect(s.value).toEqual({ monthly: 0, annual: 0, count: 0, average: null });
    expect(sentSplitLabel(s)).toBe('');
  });

  it('the sent split label drops a zero half', () => {
    expect(sentSplitLabel({ sentPortal: 3, sentHand: 0 })).toBe('3 from portal');
    expect(sentSplitLabel({ sentPortal: 0, sentHand: 2 })).toBe('2 by hand');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('value — board-facing monthly, qualified rows only', () => {
  it('uses the same monthly figure the Build and Sent cards print', () => {
    const r = build({ perHome: 8.98, homes: 62 });
    expect(monthlyValueOf(r)).toBe(pricing(r).monthlyNum);
    expect(monthlyValueOf(r)).toBeCloseTo(556.76, 6);
  });

  it('applies the tier floor, exactly as the cards do', () => {
    const tiny = build({ tierId: 'financial', perHome: 1, homes: 5 }); // $5 raw → $100 floor
    expect(monthlyValueOf(tiny)).toBe(100);
    expect(stats([tiny]).value.monthly).toBe(100);
  });

  it('sums build + sent, and new/reviewed add $0 while still counting as open', () => {
    const s = stats([
      fresh({ perHome: 50 }), reviewed({ perHome: 50 }),   // $5,000/mo each as an estimate — ignored
      build({ perHome: 10 }), sentPortal({ perHome: 20 }), sentHand({ perHome: 30 }),
    ]);
    expect(s.open).toBe(5);
    expect(s.value.monthly).toBe(1000 + 2000 + 3000);
    expect(s.value.count).toBe(3);
    expect(s.value.average).toBe(2000);
    expect(s.value.annual).toBe(6000 * 12);
  });

  it('VALUED_BUCKETS is exactly build + sent', () => {
    expect(VALUED_BUCKETS).toEqual(['build', 'sent']);
  });

  it('average is null (not NaN, not Infinity) when nothing is valued', () => {
    const s = stats([fresh(), reviewed(), won({ perHome: 99 })]);
    expect(s.value.count).toBe(0);
    expect(s.value.average).toBeNull();
    expect(s.value.monthly).toBe(0);
  });

  it('keeps the unrounded sum so annualized is not 12x a rounded hero', () => {
    const s = stats([build({ perHome: 8.98, homes: 62 }), sentPortal({ perHome: 8.98, homes: 62 })]);
    expect(s.value.monthly).toBeCloseTo(1113.52, 6);
    expect(s.value.annual).toBeCloseTo(13362.24, 6);
    expect(fmtWhole(s.value.monthly)).toBe('$1,114');
    expect(fmtCompact(s.value.annual)).toBe('$13.4k');
  });

  it('a corrupt row (non-numeric money) contributes $0 rather than NaN', () => {
    const bad = build({ perHome: 'abc', homes: NaN, tierId: 'nope' });
    expect(Number.isFinite(monthlyValueOf(bad))).toBe(true);
    const s = stats([bad, sentPortal()]);
    expect(Number.isFinite(s.value.monthly)).toBe(true);
    expect(s.value.monthly).toBe(100 + 1000); // unknown tier falls to the $100 financial floor
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('formatting', () => {
  it('fmtWhole rounds to whole dollars with thousands separators', () => {
    expect(fmtWhole(7645.4)).toBe('$7,645');
    expect(fmtWhole(7645.5)).toBe('$7,646');
    expect(fmtWhole(0)).toBe('$0');
    expect(fmtWhole(undefined)).toBe('$0');
    expect(fmtWhole(NaN)).toBe('$0');
  });

  it('fmtCompact goes to k at $10k, m at $1m, and stays whole below', () => {
    expect(fmtCompact(91740)).toBe('$91.7k');
    expect(fmtCompact(10000)).toBe('$10k');
    expect(fmtCompact(9999)).toBe('$9,999');
    expect(fmtCompact(9120)).toBe('$9,120');
    expect(fmtCompact(120000)).toBe('$120k');
    expect(fmtCompact(1_240_000)).toBe('$1.2m');
    expect(fmtCompact(0)).toBe('$0');
  });
});
