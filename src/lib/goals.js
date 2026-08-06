import { isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';
import { track } from './track.js';

// Quarterly-goals intake, in-portal variant. The public /goals page collects
// company/name/email because it has no session; opened from a `goals`-tagged
// ticket we already know the client, so identity is prefilled from DATA and the
// modal only asks for goals + challenges. Same edge function as the public page.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const clean = (s) => String(s || '').trim();

// The quarter we're collecting FOR — the current calendar quarter (this runs at
// the start of the quarter as a pre-planning intake). Mirrors quarter-goals.jsx.
export function currentQuarterLabel(now = new Date()) {
  const qi = Math.floor(now.getMonth() / 3); // 0..3
  return `Q${qi + 1} ${now.getFullYear()}`;
}

// A `goals`-tagged ticket surfaces an "Open Q{n} Form" button (in-portal modal).
// Unlike the newsletter there's no open-round gating — the tag alone drives it.
export function goalsForTicketTags(tags) {
  return (tags || []).includes('goals');
}

// The authed client's identity, for prefilling the form. Falls back to any
// values the caller passed (e.g. a staff member submitting for review).
export function goalsIdentity(form = {}) {
  return {
    company: clean(DATA.account && DATA.account.company) || clean(form.company),
    contactName: clean(DATA.user && DATA.user.name) || clean(form.contactName),
    email: clean(DATA.user && DATA.user.email) || clean(form.email),
  };
}

// Submit the quarterly goals. Identity comes from the account (prefilled — the
// client never retypes it). POSTs to the same `submit-quarter-goals` edge
// function the public page uses; the team gets an email.
export async function submitQuarterGoals(form) {
  const quarter = currentQuarterLabel();
  const { company, contactName, email } = goalsIdentity(form);
  if (!isSupabaseConfigured) throw new Error('This form is not available right now.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-quarter-goals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      company,
      contactName,
      email,
      quarter,
      wins: clean(form.wins), // optional — what worked well last quarter
      goals: clean(form.goals),
      challenges: clean(form.challenges),
      website: '', // honeypot — always empty from an authed client
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || 'Something went wrong. Please try again.');
  track('goals_submit', { quarter });
  return { ok: true };
}
