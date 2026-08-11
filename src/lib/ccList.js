// CC recipient parsing for the proposal nudge (and any future CC field).
//
// Pure logic, because it decides whether the Send button is live: a typo in the
// CC box must block the send loudly rather than get silently dropped on the
// server. The edge function (proposal-send) re-validates and is authoritative —
// this is the cockpit's fast, explicit feedback, not the security boundary.
//
// CC_MAX mirrors the server cap so the UI warns before the server truncates.

export const CC_MAX = 10;

// Deliberately loose: matches proposal-send's isEmail. Real deliverability is
// the mail provider's call, not a regex's.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isEmailish = (s) => EMAIL_RE.test(String(s || '').trim());

// "a@x.com, b@y.com; c@z.com" (or newlines/spaces — pasted lists are messy)
// → { list, invalid, dupes, ok, overflow }.
//   list     — valid, de-duped (case-insensitive), original order preserved
//   invalid  — entries that aren't email-shaped; presence means ok === false
//   overflow — true when valid entries exceed CC_MAX (server would truncate)
export function parseCcInput(raw) {
  const parts = String(raw || '').split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  const list = [];
  const invalid = [];
  const dupes = [];
  const seen = new Set();
  for (const p of parts) {
    if (!isEmailish(p)) { invalid.push(p); continue; }
    const k = p.toLowerCase();
    if (seen.has(k)) { dupes.push(p); continue; }
    seen.add(k);
    list.push(p);
  }
  return { list, invalid, dupes, ok: invalid.length === 0, overflow: list.length > CC_MAX };
}
