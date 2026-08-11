// Which intake leads become inbox proposals on this pass, and how many are left.
//
// Extracted from the cockpit because this is the decision the automatic drain
// makes unattended, on a timer: each minted lead is a DB write plus (when
// enabled) one LLM match call. Get the cap or the dedupe wrong and it either
// silently drops leads or re-mints the same ones forever.

// A WhatConverts lead is HOA intake if its form carries the intake questions.
// Matches on field NAME, mirroring the old manual intake picker.
const HOA_FIELD = /frustration|community|association|units/i;
export const isHoaIntake = (lead) => (lead?.fields || []).some((f) => HOA_FIELD.test(f?.name || ''));

// leads MUST arrive newest-first (the query orders created_at desc) so a capped
// pass works the freshest leads rather than an arbitrary slice of the archive.
//
// Returns { batch, remaining }:
//   batch     — mint these now (at most `cap`)
//   remaining — eligible leads beyond the cap. The UI MUST surface this; a
//               capped pass that looks complete is the bug this guards against.
export function selectIntakeBatch({ leads = [], existingIds = [], cap = 25 } = {}) {
  const have = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const seen = new Set();
  const eligible = [];
  for (const l of leads) {
    if (!l || l.id == null) continue;
    if (!isHoaIntake(l)) continue;
    if (have.has(l.id)) continue;      // already in the pipeline
    if (seen.has(l.id)) continue;      // duplicate id within the fetched window
    seen.add(l.id);
    eligible.push(l);
  }
  const limit = Math.max(0, cap);
  return { batch: eligible.slice(0, limit), remaining: Math.max(0, eligible.length - limit) };
}
