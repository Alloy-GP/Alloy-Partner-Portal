// ============================================================================
// Proposals · pipeline stats strip — the numbers under the stepper.
//
// Pure. Takes the rows the cockpit is already rendering and returns what the two
// cards show: how many proposals are open (by stage) and what they are worth per
// month. Nothing here fetches; a second query would be a second place to get the
// account filter wrong.
//
// TENANCY. Every row that reaches this module carries `accountId` (loadData's
// proposalRowToRaw, the archive tombstones, and the in-session mint all set it),
// and the caller passes the account being viewed. Any row whose accountId does
// not match is DROPPED — never counted, never valued. This fails closed: if a
// caller forgets the account id in live mode, every row is foreign and the strip
// shows zeros rather than another client's pipeline. proposalStats.test.js pins
// this.
//
// BUCKETS — one per row, or none. Built on uiStageOf so the strip can never
// disagree with the rail about where a proposal lives:
//   new       status 'new', never opened            ("Unopened intake")
//   reviewed  status 'new', opened by a CAM         ("Waiting to qualify")
//   build     status 'review' | 'draft' (qualified) ("Being built")
//   sent      status 'sent'                          (split portal / by hand)
// Won, Lost, Not-a-fit and Archived are closed and count nowhere.
//
// MONEY. The board-facing monthly price — pricing().monthlyNum, i.e. per-home x
// homes with the tier floor — the same "/mo Value" printed on every Build and
// Sent card, so the hero is the sum of figures a CAM can see one by one. Only
// QUALIFIED rows (build + sent) carry value: a New/Reviewed lead's price is the
// system's tier estimate that nobody has quoted yet, so it adds $0 and is left
// out of the average. Decided with the client on 2026-09-16.
// ============================================================================
import { uiStageOf } from './proposalStage.js';
import { pricing } from './proposalMockData.js';

// Rail order. Segment + tile order in the left card.
export const OPEN_BUCKETS = ['new', 'reviewed', 'build', 'sent'];
export const BUCKET_LABEL = { new: 'New', reviewed: 'Reviewed', build: 'Build', sent: 'Sent' };
// Buckets whose rows have been quoted by a human — the only ones that carry value.
export const VALUED_BUCKETS = ['build', 'sent'];

// Which open bucket a row renders in, or null when it is closed / archived / not
// a row. Exactly one answer per row, and it agrees with uiStageOf by construction.
export function openBucketOf(row) {
  const st = uiStageOf(row);
  if (st === 'new') return row.openedAt ? 'reviewed' : 'new';
  if (st === 'build') return 'build';
  if (st === 'sent') return 'sent';
  return null;
}

// Does this row belong to the account being viewed? `null` and `undefined` are
// the same "no account" (mock dev has neither), so a mock row matches a mock
// view, but a real row never matches a missing id and a missing id never
// matches a real row.
export function belongsTo(row, accountId) {
  if (!row) return false;
  return (row.accountId ?? null) === (accountId ?? null);
}

// The monthly figure a proposal is worth — the same number every list card
// prints. Non-finite or negative money (a corrupt row) counts as $0 rather than
// poisoning the sum with NaN.
export function monthlyValueOf(row) {
  const m = pricing(row).monthlyNum;
  return Number.isFinite(m) && m > 0 ? m : 0;
}

// The whole strip, from the rows on screen.
//
// Returns:
//   open       total open proposals (new + reviewed + build + sent)
//   counts     { new, reviewed, build, sent }
//   sentPortal rows in Sent the portal really emailed (sent_at stamped)
//   sentHand   rows in Sent marked by hand (no sent_at) — see sentOutsidePortal
//   segments   [{ id, label, count, pct }] for NON-ZERO buckets only, rail order;
//              pct is the bucket's share of `open`, so the bar always fills
//   value      { monthly, annual, count, average } — monthly/annual unrounded
//              sums over VALUED_BUCKETS; average is monthly / count, or null
//              when nothing is valued (never a division by zero)
//   excluded   { foreign, archived, closed } — how many rows were left out and
//              why, so the tenancy guard is observable in tests
export function proposalStats(rows, { accountId } = {}) {
  const counts = { new: 0, reviewed: 0, build: 0, sent: 0 };
  const excluded = { foreign: 0, archived: 0, closed: 0 };
  let sentPortal = 0, sentHand = 0;
  let monthly = 0, valued = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!belongsTo(row, accountId)) { excluded.foreign += 1; continue; }
    if (row.archivedAt) { excluded.archived += 1; continue; }
    const bucket = openBucketOf(row);
    if (!bucket) { excluded.closed += 1; continue; }
    counts[bucket] += 1;
    if (bucket === 'sent') { if (row.sentAt) sentPortal += 1; else sentHand += 1; }
    if (VALUED_BUCKETS.includes(bucket)) { monthly += monthlyValueOf(row); valued += 1; }
  }

  const open = OPEN_BUCKETS.reduce((n, b) => n + counts[b], 0);
  const segments = OPEN_BUCKETS
    .filter((b) => counts[b] > 0)
    .map((b) => ({ id: b, label: BUCKET_LABEL[b], count: counts[b], pct: (counts[b] / open) * 100 }));

  return {
    accountId: accountId ?? null,
    open,
    counts,
    sentPortal,
    sentHand,
    segments,
    value: {
      monthly,
      annual: monthly * 12,
      count: valued,
      average: valued > 0 ? monthly / valued : null,
    },
    excluded,
  };
}

// ---- formatting -----------------------------------------------------------
// Whole dollars: 7645.4 → "$7,645". The hero and the average.
export const fmtWhole = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Drop a trailing ".0" so 120000 reads "$120k", not "$120.0k".
const trimZero = (s) => s.replace(/\.0$/, '');

// Compact from $10k up ("$91.7k", "$1.2m"); whole dollars below that ("$9,120").
export function fmtCompact(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1_000_000) return '$' + trimZero((v / 1_000_000).toFixed(1)) + 'm';
  if (v >= 10_000) return '$' + trimZero((v / 1_000).toFixed(1)) + 'k';
  return fmtWhole(v);
}

// "9 from portal · 8 by hand" — only the non-zero halves, so a stage of purely
// portal sends does not read "· 0 by hand".
export function sentSplitLabel({ sentPortal, sentHand }) {
  const parts = [];
  if (sentPortal > 0) parts.push(`${sentPortal} from portal`);
  if (sentHand > 0) parts.push(`${sentHand} by hand`);
  return parts.join(' · ');
}
