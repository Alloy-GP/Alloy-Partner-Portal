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

// A lead the portal has marked spam or duplicate (leads.lead_status, set by the
// qualify-lead function) should never become a proposal. sync-whatconverts also
// archives any proposal already minted from one — this stops it happening again.
export const isJunk = (lead) => ['spam', 'duplicate'].includes(String(lead?.leadStatus || '').toLowerCase());

// Archive reason -> the lead_status that makes intake ignore it FOREVER.
//
// Why this exists: an archived proposal is a tombstone. The drain decides what is
// new by "has no proposal row", so hard-deleting an archived row makes it come
// straight back on the next 3-minute tick, re-matched and all. Permanently
// deleting one therefore has to flag the LEAD as junk first — that is the only
// thing isJunk() above reads, and qualify-lead also pushes quotable=no upstream
// so the submission is cleaned in WhatConverts rather than just hidden here.
//
// Everything that is not explicitly a duplicate maps to 'spam': those are the
// only two values WhatConverts write-back and lead_status accept, and a test
// submission is junk by any other name.
export function junkStatusForReason(reason) {
  return /duplicate/i.test(String(reason || '')) ? 'duplicate' : 'spam';
}

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
    if (isJunk(l)) continue;           // spam/duplicate — don't mint it in the first place
    if (have.has(l.id)) continue;      // already in the pipeline
    if (seen.has(l.id)) continue;      // duplicate id within the fetched window
    seen.add(l.id);
    eligible.push(l);
  }
  const limit = Math.max(0, cap);
  return { batch: eligible.slice(0, limit), remaining: Math.max(0, eligible.length - limit) };
}
