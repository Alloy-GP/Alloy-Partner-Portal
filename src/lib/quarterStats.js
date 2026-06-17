// ONE SOURCE OF TRUTH for the current quarter's numbers.
//
// One dataset — this quarter's projects (those with a due date inside the
// quarter) — viewed through two cuts that must sum to the same total:
//   Cut A · origin  →  planned ("Playbook" in Monday) + added (everything else)
//   Cut B · status  →  delivered (live) + inMotion (everything not live)
//   invariant:  planned + added  ===  total  ===  delivered + inMotion
//
// Every surface (dashboard "This quarter" card, Playbook, roadmap) reads these
// numbers from here so they never drift. Computed, never hardcoded.
import { enginesOf } from "./engines.js";

export function currentQuarter(now = new Date()) {
  const y = now.getFullYear();
  const qi = Math.floor(now.getMonth() / 3); // 0..3
  const start = new Date(y, qi * 3, 1);
  const end = new Date(y, qi * 3 + 3, 0, 23, 59, 59); // last day of the quarter
  return { q: qi + 1, year: y, start, end, label: `Q${qi + 1} ${y}` };
}

const toDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`) : null);

export function quarterStats(projects = [], now = new Date()) {
  const { start, end, label, q, year } = currentQuarter(now);

  // This quarter's work = projects with a due date inside the quarter.
  // No due date → not shown (keeps the invariant clean).
  const items = (projects || []).filter((p) => {
    const d = toDate(p.dueDate);
    return d && d >= start && d <= end;
  });

  const total = items.length;
  const delivered = items.filter((p) => p.status === "live").length;
  const inMotion = total - delivered; // everything not live
  const planned = items.filter((p) => p.origin === "planned").length;
  const added = total - planned; // anything not "Playbook"

  const pct = total ? Math.round((delivered / total) * 100) : 0;
  const scopeDelta = planned ? Math.round((added / planned) * 100) : 0;

  // Pace = delivered % vs how much of the quarter has elapsed.
  const span = end - start;
  const elapsed = Math.min(Math.max(now - start, 0), span);
  const elapsedPct = span ? Math.round((elapsed / span) * 100) : 0;
  const pace = pct >= elapsedPct ? "On track" : "Behind";

  // Engine chips = the IN-MOTION items grouped by primary engine (Core/no-engine
  // items aren't shown; the three chips can sum to ≤ inMotion).
  const engines = { reach: 0, match: 0, retain: 0 };
  for (const p of items) {
    if (p.status === "live") continue;
    const e = enginesOf(p)[0];
    if (e && engines[e] != null) engines[e] += 1;
  }

  return {
    label, q, year, start, end,
    total, planned, added, delivered, inMotion,
    pct, scopeDelta, elapsedPct, pace, engines,
    hasData: total > 0,
  };
}
