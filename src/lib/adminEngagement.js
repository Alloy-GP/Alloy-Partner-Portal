import { supabase } from './supabase.js';
import { engagementRowToView, normalizeReferenceLinks, parseLinkLines, invalidLinkLines } from './engagementGate.js';
import { DEFAULT_MODULES, MODULE_BY_KEY, normalizeLocations } from './engagementCatalog.js';

// Staff-side engagement proposal (Admin → client → Engagement proposal). Reads
// and writes go straight to the table under RLS (staff write, like guides);
// the client's accept / change-request path is the edge function instead.

const COLS = 'id, account_id, status, title, intro, closing, locations_count, modules, monthly_amount, setup_amount, start_date, term_months, reference_links, version, sent_at, sent_by, accepted_at, accepted_by, accepted_name, accepted_title, accepted_version, agreement_version, change_requests, created_at, updated_at';

// The account's LIVE proposal (draft/sent/accepted) or null.
export async function getEngagementProposal(accountId) {
  const { data, error } = await supabase.from('engagement_proposals').select(COLS)
    .eq('account_id', accountId).neq('status', 'withdrawn').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return engagementRowToView(data);
}

// Everything ever sent to this account, newest first (for the history strip).
export async function listEngagementProposals(accountId) {
  const { data, error } = await supabase.from('engagement_proposals').select(COLS)
    .eq('account_id', accountId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(engagementRowToView);
}

// Create or update the draft/sent row from the Admin form. Returns the view.
export async function saveEngagementProposal({ id, accountId, userId, form }) {
  const patch = formToRow(form);
  if (id) {
    const { data, error } = await supabase.from('engagement_proposals').update(patch).eq('id', id).select(COLS).single();
    if (error) throw error;
    return engagementRowToView(data);
  }
  const { data, error } = await supabase.from('engagement_proposals')
    .insert({ ...patch, account_id: accountId, status: 'draft', created_by: userId || null }).select(COLS).single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Send (or re-send after edits): locks the client's portal. A re-send of an
// already-sent proposal bumps the version so the acceptance names what they saw.
export async function sendEngagementProposal({ id, userId, currentStatus, currentVersion }) {
  const version = currentStatus === 'sent' ? (Number(currentVersion) || 1) + 1 : (Number(currentVersion) || 1);
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_by: userId || null, version })
    .eq('id', id).select(COLS).single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Withdraw: unlocks the portal; the row stays for the record and a new one can be made.
export async function withdrawEngagementProposal(id) {
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'withdrawn' }).eq('id', id).select(COLS).single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Back to draft (un-send without withdrawing) — e.g. sent by mistake.
export async function unsendEngagementProposal(id) {
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'draft' }).eq('id', id).select(COLS).single();
  if (error) throw error;
  return engagementRowToView(data);
}

// --- pure (tested in adminEngagement.test.js) --------------------------------
export function blankProposalForm({ company, locations } = {}) {
  const n = Array.isArray(locations) && locations.length ? locations.length : 1;
  return {
    title: company ? `Growth partnership for ${company}` : 'Growth partnership proposal',
    intro: '',
    closing: '',
    locationsCount: n,
    modules: [...DEFAULT_MODULES],
    monthlyAmount: '',
    setupAmount: '',
    startDate: '',
    termMonths: '',
    linksText: '',
  };
}

export function viewToForm(v) {
  if (!v) return blankProposalForm();
  return {
    title: v.title || '',
    intro: v.intro || '',
    closing: v.closing || '',
    locationsCount: v.locationsCount || 1,
    modules: [...(v.modules || [])],
    monthlyAmount: v.monthlyAmount != null ? String(v.monthlyAmount) : '',
    setupAmount: v.setupAmount != null ? String(v.setupAmount) : '',
    startDate: v.startDate || '',
    termMonths: v.termMonths != null ? String(v.termMonths) : '',
    linksText: (v.referenceLinks || []).map((l) => `${l.label} | ${l.url}`).join('\n'),
  };
}

export function formToRow(form = {}) {
  const num = (s) => { const v = Number(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(v) && v > 0 ? v : null; };
  const int = (s) => { const v = Math.floor(Number(s)); return Number.isFinite(v) && v > 0 ? v : null; };
  return {
    title: String(form.title || '').trim(),
    intro: String(form.intro || ''),
    closing: String(form.closing || ''),
    locations_count: normalizeLocations(form.locationsCount),
    modules: (form.modules || []).filter((k) => MODULE_BY_KEY[k]),
    monthly_amount: num(form.monthlyAmount),
    setup_amount: num(form.setupAmount),
    start_date: form.startDate ? String(form.startDate).slice(0, 10) : null,
    term_months: int(form.termMonths),
    reference_links: normalizeReferenceLinks(parseLinkLines(form.linksText)),
  };
}

export function validateProposalForm(form = {}) {
  const errors = {};
  if (String(form.title || '').trim().length < 3) errors.title = 'Give the proposal a title.';
  const locs = Number(form.locationsCount);
  if (!Number.isInteger(locs) || locs < 1) errors.locationsCount = 'Locations must be a whole number, 1 or more.';
  if (!(form.modules || []).some((k) => MODULE_BY_KEY[k])) errors.modules = 'Switch on at least one module.';
  const bad = invalidLinkLines(form.linksText);
  if (bad.length) errors.linksText = `Not a link: ${bad.slice(0, 2).join(', ')}${bad.length > 2 ? '…' : ''}. Use https:// URLs, one per line.`;
  if (String(form.monthlyAmount || '').trim() && !(Number(String(form.monthlyAmount).replace(/[$,\s]/g, '')) > 0)) errors.monthlyAmount = 'Enter a monthly amount, or leave it blank.';
  if (String(form.termMonths || '').trim() && !(Number.isInteger(Number(form.termMonths)) && Number(form.termMonths) > 0)) errors.termMonths = 'Term must be a whole number of months.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// The draft would be sent without money — worth a nudge, not a block.
export function sendWarnings(form = {}) {
  const w = [];
  if (!(Number(String(form.monthlyAmount || '').replace(/[$,\s]/g, '')) > 0)) w.push('No monthly amount — the client will see the scope without a price.');
  if (!String(form.intro || '').trim()) w.push('No intro — the document opens straight into the scope.');
  return w;
}
