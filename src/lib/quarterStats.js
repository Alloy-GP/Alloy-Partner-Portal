// PROJECT COUNTING — ONE SOURCE OF TRUTH for the whole portal.
//
// Status partition — every project is exactly ONE of these:
//   • delivered  → status "live"                 (done / shipped)
//   • planned    → status "planned"              (queued; shown as "On the horizon")
//   • in motion  → any other status              (in-progress / assigned / waiting
//                                                  / planning — actively being driven)
//
// Two DIFFERENT kinds of number the UI shows — keep them straight:
//   1. "In motion now"  → inMotionNow(): count of in-motion projects, ALL-TIME,
//      purely status-based (NO due-date requirement). This is the single value
//      behind every "in motion" label (sidebar badge, Playbook page, account).
//   2. "This quarter"   → quarterStats(): a COMPLETION view of the projects DUE
//      this quarter (delivered vs in-flight; planned-origin vs added). It is
//      quarter-scoped by design, and its not-yet-delivered segment is called
//      "in flight" — NOT "in motion" — so the words never collide.
//
// Plus deliveredThisQuarter(): live projects whose due date lands in the quarter.
import { enginesOf } from "./engines.js";

// --- the canonical status partition ---
export const isDelivered = (p) => p && p.status === "live";
export const isPlanned   = (p) => p && p.status === "planned";
export const isInMotion  = (p) => !!(p && p.status) && !isDelivered(p) && !isPlanned(p);

export function currentQuarter(now = new Date()) {
  const y = now.getFullYear();
  const qi = Math.floor(now.getMonth() / 3); // 0..3
  const start = new Date(y, qi * 3, 1);
  const end = new Date(y, qi * 3 + 3, 0, 23, 59, 59); // last day of the quarter
  return { q: qi + 1, year: y, start, end, label: `Q${qi + 1} ${y}` };
}

const toDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`) : null);
const inRange = (d, start, end) => { const x = toDate(d); return !!x && x >= start && x <= end; };

// CANONICAL "in motion now" — active projects being driven. Status-based,
// all-time, no due-date requirement (an active project with no date set still
// counts — that's what was wrongly dropping clients to 0/undercounting).
export function inMotionNow(projects = []) {
  return (projects || []).filter(isInMotion).length;
}

// In-motion projects broken down by primary engine — for the "Projects we're
// driving" chips, so they describe the SAME set as the in-motion badge.
export function inMotionByEngine(projects = []) {
  const e = { reach: 0, match: 0, retain: 0 };
  for (const p of (projects || []).filter(isInMotion)) {
    const k = enginesOf(p)[0];
    if (k && e[k] != null) e[k] += 1;
  }
  return e;
}

// Live projects delivered within the current quarter ("delivered this qtr").
export function deliveredThisQuarter(projects = [], now = new Date()) {
  const { start, end } = currentQuarter(now);
  return (projects || []).filter((p) => isDelivered(p) && inRange(p.dueDate, start, end)).length;
}

// COMPLETION view of THIS QUARTER's work (projects due inside the quarter).
// delivered + inFlight === total === planned-origin + added.
export function quarterStats(projects = [], now = new Date()) {
  const { start, end, label, q, year } = currentQuarter(now);

  // This quarter's work = projects with a due date inside the quarter.
  const items = (projects || []).filter((p) => inRange(p.dueDate, start, end));

  const total = items.length;
  const delivered = items.filter(isDelivered).length;
  const inFlight = total - delivered;                       // due this qtr, not yet delivered
  const planned = items.filter((p) => p.origin === "planned").length; // origin cut (Cut A)
  const added = total - planned;                            // anything not "Playbook"

  // Origin × status breakdown (for the Planned/Added split bars).
  const plannedDone = items.filter((p) => p.origin === "planned" && isDelivered(p)).length;
  const plannedMotion = planned - plannedDone;
  const addedDone = items.filter((p) => p.origin !== "planned" && isDelivered(p)).length;
  const addedMotion = added - addedDone;

  const pct = total ? Math.round((delivered / total) * 100) : 0;
  const scopeDelta = planned ? Math.round((added / planned) * 100) : 0;

  // Pace = delivered % vs how much of the quarter has elapsed.
  const span = end - start;
  const elapsed = Math.min(Math.max(now - start, 0), span);
  const elapsedPct = span ? Math.round((elapsed / span) * 100) : 0;
  const pace = pct >= elapsedPct ? "On track" : "Behind";

  return {
    label, q, year, start, end,
    total, planned, added, delivered, inFlight,
    plannedDone, plannedMotion, addedDone, addedMotion,
    pct, scopeDelta, elapsedPct, pace,
    hasData: total > 0,
  };
}
