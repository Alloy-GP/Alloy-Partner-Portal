// ============================================================================
// Engagement proposal gate — the pure decisions behind "the portal is locked to
// the proposal until the owner accepts". No React, no Supabase; tested in
// engagementGate.test.js.
//
// Seams that consume this (keep them agreeing):
//   loadData.js        → DATA.engagement (engagementRowToView)
//   App.jsx            → proposalGateState decides gate vs. portal, and mutes the
//                        autopay nudge / first-run tour while locked
//   ProposalGate.jsx   → canAcceptProposal, validateAcceptForm, agreement text
//   AdminEngagement    → parse/format reference links, status labels
// ============================================================================
import { can } from './perms.js';
import { plansFromRow, normalizeCompareRows, normalizeSections, DEFAULT_EXCLUSIVITY_MILES, DEFAULT_ROI, DEFAULT_TESTIMONIAL, VALIDITY_DAYS } from './proposalPlans.js';

// Bump when the acceptance wording changes. Stored per acceptance as
// engagement_proposals.agreement_version so we can prove which text an owner
// agreed to (same idea as the ACH authorization record).
export const PROPOSAL_AGREEMENT_VERSION = 'v1';

export function proposalAgreementText(company, proposal = {}) {
  const who = String(company || '').trim() || 'my company';
  const money = proposal.monthlyAmount != null && Number(proposal.monthlyAmount) > 0
    ? ` at the monthly investment shown (${fmtMoney(proposal.monthlyAmount)}/month${proposal.setupAmount ? `, plus a one-time ${fmtMoney(proposal.setupAmount)} setup` : ''})`
    : '';
  return `On behalf of ${who}, I accept this proposal${money}, including the scope and modules described, and authorize Alloy Growth Partners to begin the engagement. Billing is monthly by ACH autopay, set up in the next step.`;
}

// DB row (snake_case) → the shape the UI reads (camelCase). Shared by loadData
// (client) and the Admin screen so the mapping never drifts. null in → null out.
export function engagementRowToView(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    status: row.status || 'draft',
    title: row.title || '',
    intro: row.intro || '',
    closing: row.closing || '',
    locationsCount: Math.max(1, Number(row.locations_count) || 1),
    modules: Array.isArray(row.modules) ? row.modules : [],
    monthlyAmount: row.monthly_amount != null ? Number(row.monthly_amount) : null,
    setupAmount: row.setup_amount != null ? Number(row.setup_amount) : null,
    startDate: row.start_date || null,
    termMonths: row.term_months != null ? Number(row.term_months) : null,
    referenceLinks: normalizeReferenceLinks(row.reference_links),
    // v2 — statement of investment + agreement inputs. Legacy rows get one plan
    // synthesised from the summary columns so nothing in flight breaks.
    ref: row.ref || '',
    validThrough: row.valid_through || null,
    clientLegalName: row.client_legal_name || '',
    clientEntityType: row.client_entity_type || '',
    clientAddress: row.client_address || '',
    plans: plansFromRow(row),
    compareRows: normalizeCompareRows(row.compare_rows),
    markets: Array.isArray(row.markets) ? row.markets.filter(Boolean) : [],
    sections: normalizeSections(row.sections),
    spoc: row.spoc || '',
    validDays: Number(row.valid_days) > 0 ? Math.floor(Number(row.valid_days)) : VALIDITY_DAYS,
    exclusivityMiles: Math.max(1, Math.floor(Number(row.exclusivity_miles) || DEFAULT_EXCLUSIVITY_MILES)),
    roiFeePerDoor: Number(row.roi_fee_per_door) > 0 ? Number(row.roi_fee_per_door) : DEFAULT_ROI.feePerDoor,
    roiDoorsPerCommunity: Number(row.roi_doors_per_community) > 0 ? Math.floor(Number(row.roi_doors_per_community)) : DEFAULT_ROI.doorsPerCommunity,
    testimonialVimeoId: String(row.testimonial_vimeo_id || DEFAULT_TESTIMONIAL.vimeoId).trim(),
    testimonialCaption: String(row.testimonial_caption || DEFAULT_TESTIMONIAL.caption).trim(),
    welcomeCallUrl: row.welcome_call_url || '',
    preparedByName: row.prepared_by_name || '',
    acceptedPlanKey: row.accepted_plan_key || null,
    hasAgreementSnapshot: !!row.agreement_hash,
    sentBy: row.sent_by || null,
    version: Number(row.version) || 1,
    sentAt: row.sent_at || null,
    acceptedAt: row.accepted_at || null,
    acceptedName: row.accepted_name || null,
    acceptedTitle: row.accepted_title || null,
    acceptedVersion: row.accepted_version != null ? Number(row.accepted_version) : null,
    agreementVersion: row.agreement_version || null,
    // The conversation on this proposal: client questions + staff replies, in
    // time order (stored in change_requests; entries before roles existed are
    // the client's).
    thread: normalizeThread(row.change_requests),
    updatedAt: row.updated_at || null,
  };
}

// 'locked'   → render ProposalGate instead of the portal
// 'accepted' → portal open; the proposal stays readable (Account page)
// 'none'     → nothing to show
// Staff are NEVER locked: they run the client's account on its behalf. App.jsx
// folds "View as client" into user.isStaff, so that preview is locked like a
// real client — which is exactly how staff QA the page.
export function proposalGateState({ user, engagement } = {}) {
  if (!user || !user.id || user.isStaff) return 'none';
  if (!engagement) return 'none';
  if (engagement.status === 'sent') return 'locked';
  if (engagement.status === 'accepted') return 'accepted';
  return 'none';
}
export const isPortalLocked = (args) => proposalGateState(args) === 'locked';

// Only the client's OWNER commits the company. Everyone else on the account can
// read the proposal and ask questions, but the Accept button is theirs alone.
export function canAcceptProposal(user) {
  return !!user && !user.isStaff && can(user, 'acceptProposal');
}

export function validateAcceptForm(form = {}) {
  const errors = {};
  if (String(form.name || '').trim().length < 2) errors.name = 'Enter your full name.';
  if (!form.agree) errors.agree = 'Please confirm you accept the proposal to continue.';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateChangeRequest(message) {
  const m = String(message || '').trim();
  if (m.length < 5) return { ok: false, error: 'Tell us a little more so we can act on it.' };
  if (m.length > 4000) return { ok: false, error: 'Keep it under 4,000 characters.' };
  return { ok: true, message: m };
}

export const STATUS_LABEL = {
  draft: 'Draft · not visible to the client',
  sent: 'Sent · portal locked until accepted',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
};
export const statusLabel = (s) => STATUS_LABEL[s] || String(s || '');

// --- thread ----------------------------------------------------------------
// Stored as a jsonb array on the row. Every entry: { at, by, name, email, role,
// message }. role is 'client' (asked from the proposal page) or 'staff' (replied
// from Admin). Anything malformed is dropped rather than crashing the page.
export function normalizeThread(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((e) => e && typeof e.message === 'string' && e.message.trim())
    .map((e) => ({
      at: e.at || null, by: e.by || null, name: String(e.name || ''), email: String(e.email || ''),
      role: e.role === 'staff' ? 'staff' : 'client', message: String(e.message),
    }))
    .sort((a, b) => (Date.parse(a.at || 0) || 0) - (Date.parse(b.at || 0) || 0));
}
// "Sep 30, 11:32 AM" for thread entries; '' when unknown.
export function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// --- reference links -------------------------------------------------------
// Stored as [{label, url}]. Admin edits them as one line each: "Label | URL"
// (a bare URL is fine too — the label falls back to the hostname + path).
export function normalizeReferenceLinks(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((l) => ({ label: String((l && l.label) || '').trim(), url: String((l && l.url) || '').trim() }))
    .filter((l) => isHttpUrl(l.url))
    .map((l) => ({ label: l.label || labelFromUrl(l.url), url: l.url }));
}
export function isHttpUrl(s) {
  try { const u = new URL(String(s)); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
export function labelFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    const pretty = decodeURIComponent(last).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
    return pretty ? pretty.replace(/\b\w/g, (c) => c.toUpperCase()) : u.hostname;
  } catch { return String(url); }
}
export function parseLinkLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf('|');
    if (i >= 0) return { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
    return { label: '', url: line };
  });
}
export function formatLinkLines(links) {
  return normalizeReferenceLinks(links).map((l) => `${l.label} | ${l.url}`).join('\n');
}
// Which typed lines are NOT valid links (so Admin can point at them).
export function invalidLinkLines(text) {
  return parseLinkLines(text).filter((l) => !isHttpUrl(l.url)).map((l) => l.url || l.label);
}

// --- formatting ------------------------------------------------------------
export function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v % 1 ? 2 : 0 });
}
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).length <= 10 ? `${String(s).slice(0, 10)}T00:00:00` : s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
// Intro / closing are typed as paragraphs separated by blank lines.
export function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
