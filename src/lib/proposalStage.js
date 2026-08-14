// ============================================================================
// Pipeline stages, and the ONE contract for moving a proposal between them.
//
// The cockpit's stages are derived state, not a column: `status` + `disq` decide
// where a proposal renders. That is why every hand-written transition drifted —
// qualify(), disqualify(), markWon() and markLost() each maintained a camelCase
// patch AND a snake_case patch by hand, and none of them wrote the fields the
// OTHER ones own. This module owns the whole table instead.
//
// TWO FACTS THAT BITE, both learned the hard way:
//
// 1. `stageOf` reads `disq` BEFORE `status`, and Won/Lost filters them
//    INDEPENDENTLY (won = status accepted, lost = status declined OR disq). So a
//    partial patch is not "mostly right" — setting status='accepted' on a row
//    that still has disq=true renders that community in the Won column AND the
//    Lost column at once. Every move therefore writes the COMPLETE stage tuple
//    (status, disq, disqReason, salesValue), never a delta.
//
// 2. proposals.quote_value / sales_value are ANNUAL here — enrichLead derives
//    quoteValue = perHome * homes * 12. This is the opposite of lead money, which
//    is monthly end-to-end (see CLAUDE.md). Never multiply by 12 again.
//
// WHAT A MOVE MUST NEVER TOUCH (and why) — these column names appear nowhere below:
//   sent_at        the historical fact that the portal really emailed it. Nothing
//                  outside the Sent stage reads it, and it is the ONLY thing
//                  distinguishing "really sent, since demoted" from "marked sent
//                  by hand, never emailed" (null). See sentOutsidePortal().
//   board_token    NOT NULL + unique; rotating it dead-links every email already
//                  out. Only proposal-send owns it.
//   board_response the board doc's forward-only lock — proposal-respond guards on
//                  `!board_response`, so clearing it RE-ARMS a decline click that
//                  would rewrite status behind the owner's back.
//   opened_at/_by  "a CAM triaged this inbox card", not "the board opened it".
//                  Clearing it would repaint worked leads as untouched intake.
//   archived_at/_reason/_by   Archive is its own control, with its own undo.
//   match_snapshot, notes, per_home, received, source, tier_id, community, …
//                  identity and facts; not stage-scoped.
//   proposal_events  a different table entirely. No patch can reach it, so real
//                  board engagement survives every move.
// ============================================================================

// Stage ids, in rail order. 'disq' is "never a fit" — a flavour of Lost.
export const STAGE_TARGETS = ['new', 'build', 'sent', 'won', 'lost', 'disq'];

// stage id -> the `status` column value it implies.
export const STAGE_STATUS = {
  new: 'new', build: 'review', sent: 'sent',
  won: 'accepted', lost: 'declined', disq: 'declined',
};

export const STAGE_LABEL = {
  new: 'New', build: 'Build', sent: 'Sent',
  won: 'Won', lost: 'Lost', disq: 'Not a fit',
};

const MOVE_LABEL = {
  new: 'Move to New', build: 'Move to Build', sent: 'Mark as sent',
  won: 'Mark won', lost: 'Mark lost', disq: 'Mark not a fit',
};
export const stageMoveLabel = (target) => MOVE_LABEL[target] || 'Move';

// The ONE camelCase -> column map. `cols` is GENERATED from `view` through this,
// so a stage field can never be written to the local row but not the database.
const STAGE_COLS = {
  status: 'status',
  disq: 'disq',
  disqReason: 'disq_reason',
  salesValue: 'sales_value',
  quoteValue: 'quote_value',
  owner: 'owner',
};

// Coarse stage — moved VERBATIM out of screen-proposals.jsx so the bucket
// predicates and render guards there keep their exact three-value vocabulary.
export const stageOf = (s) => {
  if (s.disq) return 'closed';
  if (s.status === 'new') return 'pending';
  if (s.status === 'accepted' || s.status === 'declined') return 'closed';
  return 'qualified';
};

// Fine-grained stage — which rail bucket a row renders in. Order is load-bearing
// and mirrors stageOf's precedence (archived hides everything; disq beats status).
// Never returns two stages for one row.
export function uiStageOf(s) {
  if (!s) return null;
  if (s.archivedAt) return 'archive';
  if (s.disq) return 'disq';
  if (s.status === 'accepted') return 'won';
  if (s.status === 'declined') return 'lost';
  if (s.status === 'sent') return 'sent';
  if (s.status === 'new') return 'new';
  return 'build'; // review | draft
}

export const inNew = (s) => uiStageOf(s) === 'new';
export const inBuild = (s) => uiStageOf(s) === 'build';
export const inSent = (s) => uiStageOf(s) === 'sent';
export const inWon = (s) => uiStageOf(s) === 'won';
// Lost and "not a fit" are two flavours of the same closed-lost column.
export const inLost = (s) => { const st = uiStageOf(s); return st === 'lost' || st === 'disq'; };

// Was this marked Sent by hand rather than emailed by the portal?
//
// `sent_at` is stamped ONLY by the proposal-send edge function, and a stage move
// never writes it — so "in Sent with no sent_at" can only mean a human recorded
// a send that happened somewhere else (a call, their own email client).
//
// This matters for honesty, not bookkeeping: getWatch() falls back to
// freshWatch() for a row with no events, and freshWatch hardcodes "Just now",
// "in 30 days" and "awaiting first open". Rendering that for a proposal the
// portal never sent would invent a tracking dashboard out of nothing. Callers
// must branch on this and say so instead.
export const sentOutsidePortal = (s) => !!s && s.status === 'sent' && !s.sentAt;

// camelCase view patch -> snake_case column patch. Throws on an unknown key so a
// typo is a loud failure rather than a column that silently never saves.
export function stageCols(view) {
  const cols = {};
  for (const k of Object.keys(view || {})) {
    const col = STAGE_COLS[k];
    if (!col) throw new Error(`stageCols: no column mapped for "${k}"`);
    cols[col] = view[k];
  }
  return cols;
}

// Which moves to offer for this row: every stage except the one it's already in.
// Archived rows get nothing — the bin's thin tombstone shape has no perHome /
// selectedPains / boardToken to move, and Archive keeps its own Restore control.
export function stageMoves(s) {
  if (!s || s.archivedAt) return [];
  const here = uiStageOf(s);
  return STAGE_TARGETS.filter((t) => t !== here).map((t) => ({ id: t, label: STAGE_LABEL[t] }));
}

// What extra input a target needs before it can be written.
const NEEDS = { build: 'ownerQuote', won: 'salesValue', disq: 'disqReason' };
export const stageNeeds = (target) => NEEDS[target] || null;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Everything the UI must warn about before a move. Codes, not prose, so the
// copy lives with the component and this stays pure.
function stageWarnings(s, target) {
  const w = [];
  const here = uiStageOf(s);
  if (target === 'sent' && !s.sentAt) w.push({ code: 'notEmailed' });
  if (s.boardToken && s.sentAt && target !== 'sent') w.push({ code: 'boardLinkLive' });
  if (s.boardResponse && target !== 'sent') w.push({ code: 'boardVerdict', action: s.boardResponse.action });
  const nEvents = (s.events || []).length;
  if (nEvents && target !== 'sent') w.push({ code: 'eventsHidden', n: nEvents });
  if (s.salesValue != null && target !== 'won') w.push({ code: 'clearsSalesValue', value: s.salesValue });
  if ((here === 'won' || here === 'lost' || here === 'disq') && (target === 'new' || target === 'build' || target === 'sent')) {
    w.push({ code: 'reopensClosed', from: STAGE_LABEL[here] });
  }
  return w;
}

// Where the cockpit should land after the move, so no target can forget to reset
// a focused view onto a row that no longer belongs there.
const NAV = {
  new: { mode: 'new', inbox: false, focusBuild: false, watch: false, select: true },
  build: { mode: 'build', inbox: true, focusBuild: true, watch: false, select: true },
  sent: { mode: 'sent', inbox: true, focusBuild: false, watch: true, select: true },
  won: { mode: 'won', inbox: true, focusBuild: false, watch: false, select: false },
  lost: { mode: 'won', inbox: true, focusBuild: false, watch: false, select: false },
  disq: { mode: 'won', inbox: true, focusBuild: false, watch: false, select: false },
};

// ---------------------------------------------------------------------------
// THE CONTRACT. Returns { view, cols, nav, needs, warnings } — or { error } with
// NO view/cols when a required input is missing, so a caller can never half-apply.
//
// `view` spreads into the local row; `cols` is stageCols(view) for the DB. A key
// ABSENT from the patch is deliberately KEPT as-is.
// ---------------------------------------------------------------------------
export function stageMovePatch(s, target, opts = {}) {
  if (!s) return { error: 'no proposal' };
  if (!STAGE_TARGETS.includes(target)) return { error: `unknown stage "${target}"` };
  if (s.archivedAt) return { error: 'archived proposals must be restored first' };

  const needs = stageNeeds(target);
  const warnings = stageWarnings(s, target);

  // ---- the complete stage tuple, written on EVERY target (see fact 1 above) ----
  const view = {
    status: STAGE_STATUS[target],
    disq: target === 'disq',
    disqReason: target === 'disq' ? String(opts.disqReason || '') : '',
    // Won-only truth. Left on a demoted row it would prefill a signed figure for
    // a deal that was un-won.
    salesValue: target === 'won' ? opts.salesValue : null,
  };

  // ---- per-target extras ----
  if (target === 'build') {
    const owner = opts.owner || s.owner || 'AB';
    const quote = opts.quoteValue != null ? opts.quoteValue : s.quoteValue;
    if (!isNum(quote)) return { error: 'a quote value is required to move into Build', needs, warnings };
    view.owner = owner;
    view.quoteValue = quote;
  }
  if (target === 'won') {
    if (!isNum(opts.salesValue)) return { error: 'a signed sales value is required to mark this won', needs, warnings };
    view.owner = s.owner || 'AB';
    // Frozen on purpose: a later per-home edit must not retroactively rewrite
    // what the record says was quoted.
    if (isNum(s.quoteValue)) view.quoteValue = s.quoteValue;
  }
  if (target === 'sent') {
    view.owner = s.owner || 'AB';
    if (isNum(s.quoteValue)) view.quoteValue = s.quoteValue;
  }
  if (target === 'disq' && !String(opts.disqReason || '').trim()) {
    return { error: 'a reason is required', needs, warnings };
  }

  return { view, cols: stageCols(view), nav: NAV[target], needs, warnings };
}

// The prior stage tuple, read BY VALUE, for Undo. Re-applying it through the same
// write path restores the exact previous stage. Never re-reads component state —
// that is precisely why the existing archive Undo silently does nothing.
export function stageSnapshot(s) {
  const view = {
    status: s.status,
    disq: !!s.disq,
    disqReason: s.disqReason || '',
    salesValue: s.salesValue != null ? s.salesValue : null,
  };
  if (isNum(s.quoteValue)) view.quoteValue = s.quoteValue;
  if (s.owner) view.owner = s.owner;
  return { view, cols: stageCols(view) };
}
