import { supabase } from './supabase.js';
import { engagementRowToView, normalizeReferenceLinks, parseLinkLines, invalidLinkLines, isHttpUrl } from './engagementGate.js';
import { DEFAULT_MODULES, MODULE_BY_KEY, normalizeLocations } from './engagementCatalog.js';
import {
  PLAN_TEMPLATES, normalizePlans, pickPlan, visiblePlans, defaultCompareRows, normalizeCompareRows, normalizeSections,
  DEFAULT_EXCLUSIVITY_MILES, DEFAULT_ROI, DEFAULT_TESTIMONIAL, VALIDITY_DAYS, defaultValidThrough, proposalRef, nextRefSeq, vimeoId,
} from './proposalPlans.js';

// Staff-side engagement proposal (Admin → client → Engagement proposal). Reads
// and writes go straight to the table under RLS (staff write, like guides);
// the client's accept / question path is the edge function instead.

// The account's LIVE proposal (draft/sent/accepted) or null.
export async function getEngagementProposal(accountId) {
  const { data, error } = await supabase.from('engagement_proposals').select('*')
    .eq('account_id', accountId).neq('status', 'withdrawn').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return engagementRowToView(data);
}

// Everything ever created for this account, newest first.
export async function listEngagementProposals(accountId) {
  const { data, error } = await supabase.from('engagement_proposals').select('*')
    .eq('account_id', accountId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(engagementRowToView);
}

// Create or update from the Admin form. A new row gets its reference number
// (SHORT-YEAR-NN, sequenced per account and year) at creation so Admin shows it
// before anything is sent. Returns the view.
export async function saveEngagementProposal({ id, accountId, userId, form, shortName, currentRef }) {
  const patch = formToRow(form);
  const year = new Date().getUTCFullYear();
  const mintRef = async () => {
    const { data: existing } = await supabase.from('engagement_proposals').select('ref').eq('account_id', accountId);
    return proposalRef(shortName, year, nextRefSeq((existing || []).map((r) => r.ref), shortName, year));
  };
  if (id) {
    // Rows created before refs existed pick one up on their next save.
    if (!currentRef) patch.ref = await mintRef();
    const { data, error } = await supabase.from('engagement_proposals').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return engagementRowToView(data);
  }
  const ref = await mintRef();
  const { data, error } = await supabase.from('engagement_proposals')
    .insert({ ...patch, ref, account_id: accountId, status: 'draft', created_by: userId || null }).select('*').single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Send (or re-send after edits): locks the client's portal. A re-send bumps the
// version so the acceptance names what they saw. The validity window is the
// form's date if set, else 30 days from now (a re-send refreshes it).
export async function sendEngagementProposal({ id, userId, currentStatus, currentVersion, validThrough, validDays }) {
  const version = currentStatus === 'sent' ? (Number(currentVersion) || 1) + 1 : (Number(currentVersion) || 1);
  // The preparer's name goes on the document ("Prepared by") and in the
  // accepted state; clients can't read staff profiles, so stamp it now.
  let preparedBy = null;
  if (userId) {
    const { data: me } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
    preparedBy = (me && me.name) || null;
  }
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_by: userId || null, prepared_by_name: preparedBy, version, valid_through: validThrough || defaultValidThrough(new Date(), Number(validDays) > 0 ? Number(validDays) : VALIDITY_DAYS) })
    .eq('id', id).select('*').single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Withdraw: unlocks the portal; the row stays for the record and a new one can be made.
export async function withdrawEngagementProposal(id) {
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'withdrawn' }).eq('id', id).select('*').single();
  if (error) throw error;
  return engagementRowToView(data);
}

// Back to draft (un-send without withdrawing) — e.g. sent by mistake.
export async function unsendEngagementProposal(id) {
  const { data, error } = await supabase.from('engagement_proposals')
    .update({ status: 'draft' }).eq('id', id).select('*').single();
  if (error) throw error;
  return engagementRowToView(data);
}

// --- pure (tested in adminEngagement.test.js) --------------------------------
export function blankProposalForm({ company, locations, legalName } = {}) {
  const n = Array.isArray(locations) && locations.length ? locations.length : 1;
  return {
    title: company ? `Growth partnership for ${company}` : 'Growth partnership proposal',
    intro: '',
    closing: '',
    locationsCount: n,
    modules: [...DEFAULT_MODULES],
    plans: PLAN_TEMPLATES.map((p) => ({ ...p })),
    compareRows: defaultCompareRows(),
    sections: normalizeSections({}),
    markets: (Array.isArray(locations) ? locations : []).map((l) => (l && l.name) || l).filter(Boolean),
    spoc: '',
    validDays: String(VALIDITY_DAYS),
    preparedByName: '',
    exclusivityMiles: String(DEFAULT_EXCLUSIVITY_MILES),
    roiFeePerDoor: String(DEFAULT_ROI.feePerDoor),
    roiDoorsPerCommunity: String(DEFAULT_ROI.doorsPerCommunity),
    clientLegalName: legalName || company || '',
    clientEntityType: '',
    clientAddress: '',
    testimonialVimeoId: DEFAULT_TESTIMONIAL.vimeoId,
    testimonialCaption: DEFAULT_TESTIMONIAL.caption,
    welcomeCallUrl: '',
    validThrough: '',
    startDate: '',
    linksText: '',
    // legacy summary fields (mirrored from the recommended plan on save)
    monthlyAmount: '', setupAmount: '', termMonths: '',
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
    plans: (v.plans || []).map((p) => ({ ...p })),
    compareRows: normalizeCompareRows(v.compareRows),
    sections: normalizeSections(v.sections),
    markets: [...(v.markets || [])],
    spoc: v.spoc || '',
    validDays: String(v.validDays || VALIDITY_DAYS),
    preparedByName: v.preparedByName || '',
    exclusivityMiles: String(v.exclusivityMiles || DEFAULT_EXCLUSIVITY_MILES),
    roiFeePerDoor: String(v.roiFeePerDoor || DEFAULT_ROI.feePerDoor),
    roiDoorsPerCommunity: String(v.roiDoorsPerCommunity || DEFAULT_ROI.doorsPerCommunity),
    clientLegalName: v.clientLegalName || '',
    clientEntityType: v.clientEntityType || '',
    clientAddress: v.clientAddress || '',
    testimonialVimeoId: v.testimonialVimeoId || '',
    testimonialCaption: v.testimonialCaption || '',
    welcomeCallUrl: v.welcomeCallUrl || '',
    validThrough: v.validThrough || '',
    startDate: v.startDate || '',
    linksText: (v.referenceLinks || []).map((l) => `${l.label} | ${l.url}`).join('\n'),
    monthlyAmount: v.monthlyAmount != null ? String(v.monthlyAmount) : '',
    setupAmount: v.setupAmount != null ? String(v.setupAmount) : '',
    termMonths: v.termMonths != null ? String(v.termMonths) : '',
  };
}

const num = (s) => { const v = Number(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(v) && v > 0 ? v : null; };
const int = (s) => { const v = Math.floor(Number(s)); return Number.isFinite(v) && v > 0 ? v : null; };

export function formToRow(form = {}) {
  const plans = normalizePlans(form.plans);
  const rec = pickPlan(plans);
  return {
    title: String(form.title || '').trim(),
    intro: String(form.intro || ''),
    closing: String(form.closing || ''),
    modules: (form.modules || []).filter((k) => MODULE_BY_KEY[k]),
    plans,
    compare_rows: normalizeCompareRows(form.compareRows),
    sections: normalizeSections(form.sections),
    markets: (Array.isArray(form.markets) ? form.markets : []).map((m) => String(m || '').trim()).filter(Boolean),
    spoc: String(form.spoc || '').trim() || null,
    valid_days: int(form.validDays) || VALIDITY_DAYS,
    prepared_by_name: String(form.preparedByName || '').trim() || null,
    exclusivity_miles: int(form.exclusivityMiles) || DEFAULT_EXCLUSIVITY_MILES,
    roi_fee_per_door: num(form.roiFeePerDoor) || DEFAULT_ROI.feePerDoor,
    roi_doors_per_community: int(form.roiDoorsPerCommunity) || DEFAULT_ROI.doorsPerCommunity,
    client_legal_name: String(form.clientLegalName || '').trim() || null,
    client_entity_type: String(form.clientEntityType || '').trim() || null,
    client_address: String(form.clientAddress || '').trim() || null,
    testimonial_vimeo_id: vimeoId(form.testimonialVimeoId) || null,
    testimonial_caption: String(form.testimonialCaption || '').trim() || null,
    welcome_call_url: isHttpUrl(String(form.welcomeCallUrl || '').trim()) ? String(form.welcomeCallUrl).trim() : null,
    valid_through: form.validThrough ? String(form.validThrough).slice(0, 10) : null,
    start_date: form.startDate ? String(form.startDate).slice(0, 10) : null,
    reference_links: normalizeReferenceLinks(parseLinkLines(form.linksText)),
    // v1 summary columns mirror the recommended plan (emails, legacy readers)
    locations_count: rec ? rec.locations : normalizeLocations(form.locationsCount),
    monthly_amount: rec ? rec.monthly : num(form.monthlyAmount),
    setup_amount: rec ? (rec.setup || null) : num(form.setupAmount),
    term_months: rec ? rec.termMonths : int(form.termMonths),
  };
}

// Draft-level validation: what would make a broken document.
export function validateProposalForm(form = {}) {
  const errors = {};
  if (String(form.title || '').trim().length < 3) errors.title = 'Give the proposal a title.';
  const plans = normalizePlans(form.plans);
  if (!plans.length) errors.plans = 'Add at least one plan with a name.';
  else if (!visiblePlans(plans).length) errors.plans = 'Show at least one plan.';
  else {
    const bad = visiblePlans(plans).find((p) => !(p.monthly > 0));
    if (bad) errors.plans = `"${bad.name}" needs a monthly amount.`;
  }
  const miles = Number(form.exclusivityMiles);
  if (!Number.isInteger(miles) || miles < 1) errors.exclusivityMiles = 'Exclusivity radius must be a whole number of miles.';
  if (!(num(form.roiFeePerDoor) > 0)) errors.roiFeePerDoor = 'Fee per door must be a positive number.';
  if (!(int(form.roiDoorsPerCommunity) > 0)) errors.roiDoorsPerCommunity = 'Doors per community must be a whole number.';
  const bad = invalidLinkLines(form.linksText);
  if (bad.length) errors.linksText = `Not a link: ${bad.slice(0, 2).join(', ')}${bad.length > 2 ? '…' : ''}. Use https:// URLs, one per line.`;
  const wc = String(form.welcomeCallUrl || '').trim();
  if (wc && !isHttpUrl(wc)) errors.welcomeCallUrl = 'Paste the full scheduling link (https://…).';
  const vid = String(form.testimonialVimeoId || '').trim();
  if (vid && !vimeoId(vid)) errors.testimonialVimeoId = 'Paste the Vimeo URL or the number in it.';
  if (String(form.validDays || '').trim() && !(int(form.validDays) > 0)) errors.validDays = 'Whole number of days.';
  if (form.validThrough && !/^\d{4}-\d{2}-\d{2}$/.test(String(form.validThrough).slice(0, 10))) errors.validThrough = 'Pick a date.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// Sending puts a contract in front of a client: the legal identity must be
// complete or the agreement renders bracketed placeholders.
export function validateForSend(form = {}) {
  const base = validateProposalForm(form);
  const errors = { ...base.errors };
  if (!String(form.clientLegalName || '').trim()) errors.clientLegalName = 'The agreement needs the client’s legal name.';
  if (!String(form.clientEntityType || '').trim()) errors.clientEntityType = 'Entity type, e.g. “Louisiana limited liability company”.';
  if (!String(form.clientAddress || '').trim()) errors.clientAddress = 'Principal place of business.';
  if (!form.startDate) errors.startDate = 'The agreement’s effective date is the start date.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// Worth a nudge, not a block.
export function sendWarnings(form = {}) {
  const w = [];
  if (!String(form.intro || '').trim()) w.push('No intro — the cover opens without your paragraph.');
  if (!String(form.testimonialVimeoId || '').trim()) w.push('No testimonial video — the proof card shows documents only.');
  if (!parseLinkLines(form.linksText).length) w.push('No reference documents linked.');
  if (!String(form.welcomeCallUrl || '').trim()) w.push('No welcome-call scheduling link — the accepted state will say we’ll reach out.');
  return w;
}

// The right-rail "Client will see" checklist. Everything but the owner is a
// hard gate on Send (the README: "checklist gates Send").
export function sendChecklist(form = {}, invites = []) {
  const plans = normalizePlans(form.plans);
  const owner = (invites || []).some((i) => i && !i.is_staff && i.role === 'owner');
  return [
    { key: 'markets', label: 'Markets selected', ok: (form.markets || []).length > 0, hard: true },
    { key: 'plan', label: 'A recommended plan', ok: visiblePlans(plans).some((p) => p.recommended && p.monthly > 0), hard: true },
    { key: 'legal', label: 'Client legal name', ok: !!String(form.clientLegalName || '').trim(), hard: true },
    { key: 'entity', label: 'Entity type & address', ok: !!String(form.clientEntityType || '').trim() && !!String(form.clientAddress || '').trim(), hard: true },
    { key: 'start', label: 'Start date', ok: !!form.startDate, hard: true },
    { key: 'owner', label: 'An owner invited', ok: owner, hard: false },
  ];
}

// Every live proposal's status, keyed by account — the clients list dot.
export async function listLiveProposalStatuses() {
  const { data, error } = await supabase.from('engagement_proposals').select('account_id, status').neq('status', 'withdrawn');
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.account_id, r.status]));
}

// Activity feed: the client's proposal events (staff can read events) with
// names resolved from the account's profiles, plus the send itself.
const ACTIVITY = {
  proposal_viewed: { what: (n, m) => `${n} viewed${m.version ? ` v${m.version}` : ''}`, color: '#a1c8e7' },
  proposal_plan_selected: { what: (n, m) => `${n} looked at the ${m.planKey || ''} plan`.replace(/  +/g, ' '), color: '#a1c8e7' },
  proposal_agreement_opened: { what: (n) => `${n} opened the agreement`, color: '#f5d880' },
  proposal_agreement_confirmed: { what: (n) => `${n} confirmed the agreement`, color: '#f5d880' },
  proposal_accepted: { what: (n) => `${n} accepted`, color: '#aed7d0' },
  proposal_change_requested: { what: (n) => `${n} asked a question`, color: '#d9356e' },
  proposal_ref_open: { what: (n) => `${n} opened a reference document`, color: '#a1c8e7' },
};
export function activityFromEvents(events, names, view) {
  const out = (events || []).filter((e) => ACTIVITY[e.type]).map((e) => {
    const n = names[e.user_id] || 'Client';
    return { at: e.created_at, what: ACTIVITY[e.type].what(n, e.meta || {}), color: ACTIVITY[e.type].color };
  });
  if (view && view.sentAt) out.push({ at: view.sentAt, what: `You sent v${view.version}`, color: '#d9356e' });
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 12);
}
export async function loadProposalActivity(accountId, view) {
  const [ev, prof] = await Promise.all([
    supabase.from('events').select('user_id, type, meta, created_at').eq('account_id', accountId).like('type', 'proposal_%').order('created_at', { ascending: false }).limit(60),
    supabase.from('profiles').select('id, name').eq('account_id', accountId),
  ]);
  if (ev.error) throw ev.error;
  const names = Object.fromEntries((prof.data || []).map((p) => [p.id, (p.name || '').split(/\s+/)[0] || 'Client']));
  return activityFromEvents(ev.data || [], names, view);
}
