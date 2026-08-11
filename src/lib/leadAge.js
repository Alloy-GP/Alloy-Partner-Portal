// When did this intake lead actually arrive, and how old is it?
//
// WHY THIS EXISTS: the New inbox used to show "Arrived <relative>" computed from
// proposals.created_at — the moment a SYNC minted the row, not when the board
// submitted the form. A backlog sync mints weeks of leads in one minute, so
// every card read "Arrived just now" (observed live: leads up to 35 days old,
// all minted within the same 60 seconds). There was no way to tell a fresh lead
// from a month-old one.
//
// The real submission time now lives on proposals.received_at. This module
// resolves it with a fallback chain, because three generations of rows exist:
//   1. received_at   — the true timestamp (backfilled + written on mint)
//   2. received       — a pre-formatted display string on legacy/demo/seed rows
//   3. arrivedAt      — row-mint time; last resort, and the thing that was wrong
//
// Age is always computed at RENDER time from the timestamp, never stored as a
// label — a frozen "2h ago" string is how this class of bug starts.

// Legacy `received` strings were formatted by whoever wrote the row, so the
// date/time separator varies by source: " · " (mock pipeline), " at " (live
// intake via toLocaleString), " * " (reset-demo seeder).
const SEPARATORS = [' · ', ' at ', ' * '];

// "May 21, 2026 · 9:42 AM" → epoch ms, or null when unparseable.
// Naive local time (no zone in the string) — interpreted in the runtime's zone,
// which is the best available reading of a display string.
export function parseReceivedText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let s = raw;
  for (const sep of SEPARATORS) s = s.split(sep).join(' ');
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

// A proposal/lead view-model → the best received timestamp we have, in epoch ms.
// Order matters: the true column wins, then the legacy string, then mint time.
export function receivedMs(sub) {
  if (!sub) return null;
  if (sub.receivedAt) {
    const ms = Date.parse(sub.receivedAt);
    if (!Number.isNaN(ms)) return ms;
  }
  const fromText = parseReceivedText(sub.received);
  if (fromText != null) return fromText;
  if (sub.arrivedAt) {
    const ms = Date.parse(sub.arrivedAt);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

// Absolute stamp for the card: "Jul 7, 6:47 PM" — with the year only when it
// isn't the current one, so the common case stays short.
export function fmtReceived(ms, { now = Date.now(), timeZone } = {}) {
  if (ms == null) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (timeZone) opts.timeZone = timeZone;
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = 'numeric';
  return d.toLocaleString('en-US', opts).replace(/,\s*(?=\d+:\d)/, ', ');
}

// ALWAYS relative, unlike relAgo() in the cockpit which degrades to a date past
// a week — here the absolute stamp is already shown beside it, so the age must
// stay an age or the card says the same thing twice.
export function ageAgo(ms, now = Date.now()) {
  if (ms == null) return '';
  const diff = now - ms;
  if (Number.isNaN(diff)) return '';
  if (diff < 0) return 'just now'; // clock skew between browser and DB
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// How fresh is the intake pull itself? Judged against the server cadence:
// whatconverts-daily cron runs every 30 min (plus whatconverts-webhook for
// near-instant), so one missed cycle is normal jitter and several means the
// pipe is broken and the inbox is quietly out of date.
//   live  — within ~1.5 cron cycles (45 min)
//   lag   — 45 min to 3 h; a cycle or two missed
//   cold  — over 3 h, or never synced
export function syncFreshness(ms, now = Date.now()) {
  if (ms == null) return 'cold';
  const mins = (now - ms) / 60000;
  if (Number.isNaN(mins)) return 'cold';
  if (mins <= 45) return 'live';
  if (mins <= 180) return 'lag';
  return 'cold';
}

// How stale is this unworked lead? Drives the card's emphasis so an aging lead
// reads as aging without the CAM doing date math.
//   fresh  — under a day
//   aging  — 1-6 days
//   stale  — a week or more
export function agePriority(ms, now = Date.now()) {
  if (ms == null) return 'fresh';
  const days = (now - ms) / 86400000;
  if (days < 1) return 'fresh';
  if (days < 7) return 'aging';
  return 'stale';
}
