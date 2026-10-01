import { can } from './perms.js';

// ============================================================
// Onboarding checklist — template + pure helpers (no React, no Supabase).
//
// Replaces the Google Sheet Alloy used to email every new client (tabs: Team &
// Contacts · Access & Credentials · Business Resources · Marketing & Tracking).
// The template below is instantiated per account into `onboarding_items` by
// the `admin` edge function (onboarding_start / onboarding_reset) — by default
// the moment a client is created in Admin — so every client gets the same
// list and nobody resets statuses by hand.
//
// To add a line item: append to TEMPLATE with a NEW stable `key`. Existing
// clients pick it up from Admin → Onboarding → "Add N new items" (which is just
// onboarding_start again: it inserts only keys the account doesn't have yet).
// Never reuse or rename a key — it's the identity the client's answers hang on.
// ============================================================

export const SECTIONS = [
  { id: 'contacts', title: 'Team & contacts', kicker: 'Who we work with',
    blurb: 'Everyone on your side we should know — decision makers, your marketing lead, and whoever we should copy on updates.' },
  { id: 'locations', title: 'Locations', kicker: 'Where you operate',
    blurb: 'Every office or market we should know about — the name you use for it, its address, and the phone number clients call. These flow straight into your account and power your proposal, listings and local pages.' },
  { id: 'billing', title: 'Billing', kicker: 'Autopay',
    blurb: 'Add the bank account your monthly Alloy fees draft from. It’s a one-minute, bank-grade form — your details go straight to Intuit and are never typed into this checklist.' },
  { id: 'access', title: 'Access & credentials', kicker: 'Platform access',
    blurb: 'Where possible, invite admin@alloygp.co as an administrator instead of sharing a password. Set each line’s status so we know where it stands — “Stuck” flags it for your Alloy team.' },
  { id: 'resources', title: 'Business resources', kicker: 'Brand & proof',
    blurb: 'Drop files in your upload folder (button above) and mark each line once it’s there, or paste a shared-drive link.' },
  { id: 'marketing', title: 'Marketing & tracking', kicker: 'What’s already running',
    blurb: 'Reports, CRM, email tools and any tracking scripts already on your site. Add anything else you use at the bottom.' },
];

// The sheet's Status dropdown, verbatim. `tone` drives the pill colour.
export const STATUSES = [
  { value: 'pending', label: 'Pending', tone: 'muted', help: 'Not started yet.' },
  { value: 'request_sent', label: 'Request sent', tone: 'blue', help: 'You’ve sent the invite or request — we’ll confirm once we’re in.' },
  { value: 'complete', label: 'Complete', tone: 'green', help: 'Done on your side. Add the details below if we need them to get in.' },
  { value: 'new_account', label: 'New account', tone: 'purple', help: 'Doesn’t exist yet — Alloy will set it up for you.' },
  { value: 'stuck', label: 'Stuck', tone: 'pink', help: 'Need a hand? Tell us what’s in the way and your Alloy team will take it from here.' },
  { value: 'optional', label: 'Optional', tone: 'muted', help: 'Nice to have — skip it for now.' },
  { value: 'na', label: 'N/A', tone: 'muted', help: 'Doesn’t apply to your business.' },
];
export const STATUS_VALUES = STATUSES.map((s) => s.value);

// Which inputs an item's detail panel shows, by kind.
export const KINDS = {
  credential: [
    { k: 'username', label: 'Username / email', type: 'text' },
    { k: 'password', label: 'Password', type: 'password' },
    { k: 'url', label: 'Login URL', type: 'url', placeholder: 'https://' },
    { k: 'account_number', label: 'Account / ID number', type: 'text' },
    { k: 'notes', label: 'Notes for Alloy', type: 'textarea', placeholder: 'Anything we should know — where to find it, who owns it, what’s blocking…' },
  ],
  upload: [
    { k: 'link', label: 'Link (shared drive, Dropbox, your upload folder…)', type: 'url', placeholder: 'https://' },
    { k: 'notes', label: 'Notes for Alloy', type: 'textarea', placeholder: 'What’s there, what’s missing, anything we should know…' },
  ],
  tool: [
    { k: 'url', label: 'URL', type: 'url', placeholder: 'https://' },
    { k: 'username', label: 'Username / email', type: 'text' },
    { k: 'password', label: 'Password', type: 'password' },
    { k: 'notes', label: 'Notes for Alloy', type: 'textarea', placeholder: 'What you use it for…' },
  ],
  // Bank step — no free-text fields on purpose (PCI): the row opens the real
  // autopay flow and its status is derived from quickbooks_payment_methods.
  payment: [],
  // Locations: the row's label is the location name. Synced into
  // accounts.locations by a DB trigger (see migration 20261001180000).
  location: [
    { k: 'address', label: 'Address', type: 'text', placeholder: 'Street, City, ST ZIP' },
    { k: 'phone', label: 'Phone', type: 'tel' },
  ],
  contact: [
    { k: 'title', label: 'Title / role', type: 'text' },
    { k: 'email', label: 'Email', type: 'email' },
    { k: 'phone', label: 'Phone', type: 'tel' },
  ],
};

const INVITE = 'Send an administrator invite to admin@alloygp.co.';
const WE_REQUEST = 'Alloy will send an admin request — just approve it when it lands. Mark N/A if you don’t have one.';

// Contacts aren't templated (every client's team is different) — the client
// adds their own rows. Everything else mirrors the sheet, row for row.
export const TEMPLATE = [
  // ── Billing ───────────────────────────────────────────────────────────────
  { section: 'billing', key: 'bank_account', kind: 'payment', label: 'Bank account for autopay', hint: 'Your monthly Alloy fees draft automatically on or about the 1st. Takes about a minute; Alloy never sees your account number.' },
  // ── Access & credentials ──────────────────────────────────────────────────
  { section: 'access', key: 'domain', kind: 'credential', label: 'Domain registrar access', hint: `${INVITE} (GoDaddy, Namecheap, Google Domains…)` },
  { section: 'access', key: 'hosting', kind: 'credential', label: 'Hosting provider login', hint: `${INVITE} (WP Engine, SiteGround, Bluehost…)` },
  { section: 'access', key: 'cms', kind: 'credential', label: 'Website CMS login (WordPress, Wix, Squarespace, etc.)', hint: 'An admin-level login, or invite admin@alloygp.co as an administrator.' },
  { section: 'access', key: 'google_ads', kind: 'credential', label: 'Google Ads account number', hint: 'Top-right in Google Ads — a 10-digit number like 123-456-7890. Mark “New account” if you’ve never run ads.' },
  { section: 'access', key: 'gbp', kind: 'credential', label: 'Google Business Profile', hint: `${INVITE} (business.google.com → Business Profile settings → People and access)` },
  { section: 'access', key: 'ga', kind: 'credential', label: 'Google Analytics', hint: `${INVITE} (Admin → Account access management)` },
  { section: 'access', key: 'gsc', kind: 'credential', label: 'Google Search Console', hint: `${INVITE} (Settings → Users and permissions)` },
  { section: 'access', key: 'gtm', kind: 'credential', label: 'Google Tag Manager', hint: `${INVITE} Mark “New account” if you don’t have one — we’ll create it.` },
  { section: 'access', key: 'linkedin', kind: 'credential', label: 'LinkedIn company page', hint: WE_REQUEST },
  { section: 'access', key: 'instagram', kind: 'credential', label: 'Instagram', hint: WE_REQUEST },
  { section: 'access', key: 'youtube', kind: 'credential', label: 'YouTube', hint: WE_REQUEST },
  { section: 'access', key: 'facebook', kind: 'credential', label: 'Facebook page', hint: 'Add Alloy as a Page admin from Meta Business Suite — we’ll send the request.' },
  // ── Business resources ────────────────────────────────────────────────────
  { section: 'resources', key: 'brand_guide', kind: 'upload', label: 'Brand style guide (colors, fonts, usage)', hint: 'Upload it to your folder, or link it. No formal guide? Tell us what you do have.' },
  { section: 'resources', key: 'logos', kind: 'upload', label: 'Logo files (high-res, transparent)', hint: 'SVG/EPS/AI ideally, plus PNG on transparent — every variation you use.' },
  { section: 'resources', key: 'media_library', kind: 'upload', label: 'Image/video library (or shared drive links)', hint: 'Team photos, communities, events, b-roll — anything we can use.' },
  { section: 'resources', key: 'proof', kind: 'upload', label: 'Existing case studies, testimonials, or success stories', hint: 'Reviews, board quotes, before/after wins — proof we can build on.' },
  // ── Marketing & tracking ──────────────────────────────────────────────────
  { section: 'marketing', key: 'reports', kind: 'upload', label: 'Current marketing reports (if available)', hint: 'Anything a previous agency or tool sent you — SEO, ads, social.' },
  { section: 'marketing', key: 'crm', kind: 'credential', label: 'Access to any CRM or lead tracking system', hint: 'HubSpot, Salesforce, a spreadsheet — wherever leads land today.' },
  { section: 'marketing', key: 'email_platform', kind: 'credential', label: 'Active newsletter / email marketing platform', hint: 'Mailchimp, Constant Contact, etc. Invite admin@alloygp.co if you can.' },
  { section: 'marketing', key: 'tracking', kind: 'upload', label: 'Tracking codes / scripts currently installed', hint: 'FB Pixel, LinkedIn Insight Tag, call tracking… list what you know is on the site.' },
];

// The rows the admin function inserts for a new checklist. No account_id —
// the function stamps it (so a staffer can't accidentally seed another client).
export function templateRows() {
  return TEMPLATE.map((t, i) => ({
    section: t.section, key: t.key, label: t.label, hint: t.hint || '', kind: t.kind,
    status: 'pending', fields: {}, custom: false, sort: i * 10,
  }));
}

// Template entries an existing checklist doesn't have yet (the template grew
// after it was started). Drives Admin → "Add N new items".
export function missingTemplateItems(items) {
  const have = new Set((items || []).map((i) => i.key));
  return TEMPLATE.filter((t) => !have.has(t.key));
}

// "Nothing left for the client to do" — complete, or explicitly out of scope.
// new_account is resolved on the client's side too (Alloy creates it).
export const RESOLVED_STATUSES = ['complete', 'na', 'optional', 'new_account'];
export function isResolved(status) { return RESOLVED_STATUSES.includes(status); }
export function statusMeta(value) { return STATUSES.find((s) => s.value === value) || STATUSES[0]; }
export function fieldsFor(kind) { return KINDS[kind] || KINDS.credential; }

// DB row (snake_case) → the item shape every screen reads.
export function rowToItem(r) {
  return {
    id: r.id, section: r.section, key: r.key, label: r.label || '', hint: r.hint || '',
    kind: r.kind || 'credential', status: r.status || 'pending',
    alloyStatus: r.alloy_status || null,
    fields: r.fields && typeof r.fields === 'object' ? r.fields : {},
    custom: !!r.custom, sort: Number(r.sort) || 0,
    createdAt: r.created_at || null, updatedAt: r.updated_at || null, updatedBy: r.updated_by || '',
  };
}

// Items by section, in display order (sort, then creation).
export function groupBySection(items) {
  const out = {};
  SECTIONS.forEach((s) => { out[s.id] = []; });
  (items || []).forEach((it) => { (out[it.section] || (out[it.section] = [])).push(it); });
  Object.values(out).forEach((list) => list.sort((a, b) =>
    (a.sort - b.sort) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  return out;
}

// Free-form sections: rows the client adds (people, places) — listed, not
// scored. Everything else is a to-do with a status.
export const FREEFORM_SECTIONS = ['contacts', 'locations'];
export const isFreeform = (section) => FREEFORM_SECTIONS.includes(section);

// Progress over the checklist proper (free-form sections excluded).
export function onboardingProgress(items) {
  const list = (items || []).filter((i) => !isFreeform(i.section));
  const total = list.length;
  const resolved = list.filter((i) => isResolved(i.status)).length;
  return {
    total, resolved, open: total - resolved,
    stuck: list.filter((i) => i.status === 'stuck').length,
    confirmed: list.filter((i) => i.alloyStatus === 'complete').length,
    pct: total ? Math.round((resolved / total) * 100) : 0,
  };
}

// Nav + route gate. Only accounts where Alloy started a checklist have the page
// at all, and only roles allowed to see credentials (perms: screen_onboarding).
export function canSeeOnboarding(user, account, onboarding) {
  if (!user || !can(user, 'screen_onboarding')) return false;
  const ob = onboarding || {};
  const started = !!(ob.startedAt || (account && account.onboardingStartedAt));
  return started || (ob.items || []).length > 0;
}

// Sidebar badge: open items until staff mark onboarding complete.
export function onboardingNavCount(onboarding) {
  const ob = onboarding || {};
  if (ob.completedAt) return 0;
  return onboardingProgress(ob.items).open;
}

// Dashboard Action Queue card: while there's an open checklist with work left.
export function shouldNudgeOnboarding({ user, account, onboarding } = {}) {
  if (!canSeeOnboarding(user, account, onboarding)) return false;
  const ob = onboarding || {};
  if (ob.completedAt) return false;
  const p = onboardingProgress(ob.items);
  return p.total > 0 && p.open > 0;
}

// The bank row's status is never set by hand: a bank on file = complete; an
// account Alloy exempted from autopay = n/a; otherwise whatever is stored
// (pending). loadData applies this so every consumer sees the same answer.
export function derivePaymentStatus(item, { bankOnFile, autopayRequired } = {}) {
  if (!item || item.kind !== 'payment') return item;
  const status = bankOnFile ? 'complete' : autopayRequired === false ? 'na' : item.status;
  return status === item.status ? item : { ...item, status };
}
export function applyPaymentStatus(items, ctx) {
  return (items || []).map((i) => derivePaymentStatus(i, ctx));
}

// While an OPEN checklist carries the bank step, the autopay sign-in modal and
// persistent banner stand down (the checklist, its nav badge and the dashboard
// card already point at it). Once staff mark onboarding complete — or for
// accounts with no checklist — the regular nudge resumes.
export function onboardingOwnsPaymentNudge(onboarding) {
  const ob = onboarding || {};
  if (ob.completedAt) return false;
  if (!ob.startedAt && !(ob.items || []).length) return false;
  return (ob.items || []).some((i) => i.kind === 'payment');
}

const uuid = () => (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
  ? globalThis.crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// A client-added row (extra contact, "other tool"). `sort` = caller passes the
// section's current max + 10 so new rows land at the bottom, in order.
export function newCustomItem({ accountId, section, label = '', sort = 0 } = {}) {
  const kind = section === 'contacts' ? 'contact' : section === 'locations' ? 'location' : section === 'marketing' ? 'tool' : 'upload';
  return {
    account_id: accountId, section, key: `custom:${uuid()}`, label, hint: '', kind,
    status: 'pending', fields: {}, custom: true, sort,
  };
}
export function nextSort(items, section) {
  return (items || []).filter((i) => i.section === section).reduce((m, i) => Math.max(m, Number(i.sort) || 0), 0) + 10;
}
