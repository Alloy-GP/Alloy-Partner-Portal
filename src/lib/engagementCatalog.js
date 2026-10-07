// ============================================================================
// Engagement catalog — the EVERGREEN content behind Alloy's own client proposal.
//
// A proposal is not written from scratch: staff switch modules on for a client
// (Admin → client → Engagement proposal) and set how many locations the client
// manages. Every module here knows how it scales with locations, so the client
// sees, line by line, why three markets is more work than one — and the whole
// document is regenerated from this file plus the row in engagement_proposals.
//
// Pure data + pure functions (no React, no Supabase) → unit-tested in
// engagementCatalog.test.js. Adding a service = adding one entry to MODULES.
//
// Scaling model, per module:
//   deliverables: what the client gets. `per: 'location'` lines multiply by the
//                 location count; `per: 'flat'` lines don't.
//   effort:       relative monthly effort units — `flat` once for the engagement,
//                 `perLocation` for every market. Units are relative (not hours);
//                 the doc shows them as a bar vs. a single-location engagement.
// ============================================================================

export const ENGINE_META = [
  { key: 'core',   name: 'Foundation',  tagline: 'The always-on core every market runs on', color: '#381c4f' },
  { key: 'reach',  name: 'BoardReach',  tagline: 'Attract boards — be found in every market you serve', color: '#d9356e' },
  { key: 'match',  name: 'BoardMatch',  tagline: 'Close — turn inbound boards into signed contracts', color: '#f5d880' },
  { key: 'retain', name: 'BoardRetain', tagline: 'Keep — reputation, education and retention', color: '#2c7d68' },
];
export const ENGINE_BY_KEY = Object.fromEntries(ENGINE_META.map((e) => [e.key, e]));

// Catalog order = document order.
export const MODULES = [
  // ── Foundation ─────────────────────────────────────────────────────────────
  {
    key: 'foundation', engine: 'core', name: 'Foundation & onboarding',
    summary: 'The six-step Alloy Blueprint that everything else is built on.',
    includes: ['Master brief & positioning interview', 'Keyword research', 'Growth audit', 'Content map', 'Sitemap', 'Your first quarterly playbook'],
    deliverables: [{ per: 'flat', qty: 6, unit: 'Blueprint deliverables', note: 'first 45 days' }],
    effort: { flat: 8, perLocation: 0 },
  },
  {
    key: 'tracking', engine: 'core', name: 'Tracking & attribution',
    summary: 'Every call, form and click traced back to the market and channel that produced it.',
    includes: ['WhatConverts call & form tracking', 'GA4 + Search Console', 'Lead qualification in your portal'],
    deliverables: [{ per: 'location', qty: 1, unit: 'tracking number & form route' }, { per: 'flat', qty: 1, unit: 'analytics baseline captured' }],
    effort: { flat: 2, perLocation: 1 },
  },
  {
    key: 'reporting', engine: 'core', name: 'Reporting & strategy cadence',
    summary: 'You always know what we did, what moved, and what is next.',
    includes: ['Monthly report', 'Weekly internal SEO audit', 'Quarterly growth audit, playbook and impact report', 'Strategist call each quarter'],
    deliverables: [{ per: 'flat', qty: 12, unit: 'monthly reports / year' }, { per: 'flat', qty: 4, unit: 'quarterly playbooks / year' }],
    effort: { flat: 4, perLocation: 0 },
  },
  {
    key: 'portal', engine: 'core', name: 'Growth Portal',
    summary: 'Your live view of the partnership: playbook, roadmap, leads, inbox and billing in one place.',
    includes: ['Quarterly playbook, live from our project board', 'Lead queue with one-click qualification', 'Market-by-market growth roadmap', 'Direct inbox to your Alloy team'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'portal, every seat on your team' }],
    effort: { flat: 1, perLocation: 0 },
  },

  // ── BoardReach ─────────────────────────────────────────────────────────────
  {
    key: 'website', engine: 'reach', name: 'Website build or refresh',
    summary: 'A fast, search-first site with a page for every market you want to win.',
    includes: ['Astro build on the Alloy foundation', 'Service pages', 'Technical SEO passing at launch', 'Post-launch verification'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'site build or refresh' }, { per: 'location', qty: 1, unit: 'city / location page' }],
    effort: { flat: 10, perLocation: 2 },
  },
  {
    key: 'local-seo', engine: 'reach', name: 'Local SEO & citations',
    summary: 'Consistent name, address and phone everywhere a board could look.',
    includes: ['NAP cleanup', 'Directory & citation listings', 'Local schema'],
    deliverables: [{ per: 'location', qty: 15, unit: 'directory listings' }],
    effort: { flat: 1, perLocation: 3 },
  },
  {
    key: 'gbp', engine: 'reach', name: 'Google Business Profile management',
    summary: 'Own the map pack in each market: profiles optimized and posted to every week.',
    includes: ['Profile optimization', 'Weekly posts', 'Photo & Q&A management', 'Local-pack rank tracking'],
    deliverables: [{ per: 'location', qty: 1, unit: 'profile managed weekly' }, { per: 'location', qty: 4, unit: 'posts / month' }],
    effort: { flat: 0, perLocation: 3 },
  },
  {
    key: 'seo-content', engine: 'reach', name: 'SEO content engine',
    summary: 'Authority content that ranks for what boards actually search.',
    includes: ['Long-form articles', 'Pillar / cluster architecture', 'AI-search (GEO) optimization', 'Market pages as you expand'],
    deliverables: [{ per: 'flat', qty: 2, unit: 'articles / month' }, { per: 'location', qty: 1, unit: 'market authority page / quarter' }],
    effort: { flat: 6, perLocation: 1 },
  },
  {
    key: 'paid-media', engine: 'reach', name: 'Google Ads',
    summary: 'Paid demand in each market while organic compounds.',
    includes: ['Geo-targeted campaigns', 'Landing pages', 'Conversion tracking', 'Monthly optimization'],
    deliverables: [{ per: 'location', qty: 1, unit: 'geo campaign' }, { per: 'flat', qty: 1, unit: 'landing-page set' }],
    effort: { flat: 3, perLocation: 2 },
  },
  {
    key: 'social', engine: 'reach', name: 'Social media cadence',
    summary: 'A steady, on-brand presence that proves you are active.',
    includes: ['Content calendar', 'Design & copy', 'Scheduling & monitoring'],
    deliverables: [{ per: 'flat', qty: 60, unit: 'posts / quarter' }],
    effort: { flat: 4, perLocation: 0 },
  },
  {
    key: 'video', engine: 'reach', name: 'Video & thought leadership',
    summary: 'Short explainers and expert clips that boards share with each other.',
    includes: ['Scripts', 'Editing', 'Distribution across site, GBP and social'],
    deliverables: [{ per: 'flat', qty: 2, unit: 'videos / month' }],
    effort: { flat: 5, perLocation: 0 },
  },

  // ── BoardMatch ─────────────────────────────────────────────────────────────
  {
    key: 'lead-routing', engine: 'match', name: 'Lead capture & routing',
    summary: 'The canonical request-a-proposal form, routed to the right person in every market.',
    includes: ['3-step proposal request form', 'Per-market routing & alerts', 'CRM sync when you are ready'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'proposal request form' }, { per: 'location', qty: 1, unit: 'routing rule & alert' }],
    effort: { flat: 2, perLocation: 1 },
  },
  {
    key: 'proposal-system', engine: 'match', name: 'Alloy Proposal System',
    summary: 'Intake, match and send a tailored board proposal in minutes, then watch it get read.',
    includes: ['Intake from your website form', 'Concern matching against your strengths', 'Board-facing proposal link', 'Read & response tracking'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'proposal system, switched on in your portal' }],
    effort: { flat: 6, perLocation: 0 },
  },
  {
    key: 'sales-messaging', engine: 'match', name: 'Sales messaging & RFP kit',
    summary: 'One voice from first call to signed contract.',
    includes: ['Positioning & differentiators', 'RFP response templates', 'Business-development training'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'messaging & RFP kit' }, { per: 'flat', qty: 2, unit: 'BD training sessions / year' }],
    effort: { flat: 4, perLocation: 0 },
  },
  {
    key: 'proof-content', engine: 'match', name: 'Case studies & proof',
    summary: 'Evidence a board in each market can recognize itself in.',
    includes: ['Case-study interviews', 'Design & publishing', 'Proof modules on service pages'],
    deliverables: [{ per: 'location', qty: 1, unit: 'case study' }],
    effort: { flat: 0, perLocation: 2 },
  },

  // ── BoardRetain ────────────────────────────────────────────────────────────
  {
    key: 'review-program', engine: 'retain', name: 'Review generation & response',
    summary: 'A reputation engine in every market, not just headquarters.',
    includes: ['Review request flow', 'Response program', 'Monitoring & alerts'],
    deliverables: [{ per: 'location', qty: 1, unit: 'review flow & response queue' }],
    effort: { flat: 2, perLocation: 1 },
  },
  {
    key: 'newsletter', engine: 'retain', name: 'Monthly newsletter',
    summary: 'Stay in front of the boards you already have.',
    includes: ['Content prompts in your portal', 'Design & copy', 'Send & engagement report'],
    deliverables: [{ per: 'flat', qty: 12, unit: 'issues / year' }],
    effort: { flat: 3, perLocation: 0 },
  },
  {
    key: 'board-education', engine: 'retain', name: 'Board education hub',
    summary: 'Guides and courses that make your boards better clients.',
    includes: ['Resource hub', 'Gated guides', 'Course modules'],
    deliverables: [{ per: 'flat', qty: 1, unit: 'resource hub' }, { per: 'flat', qty: 4, unit: 'guides / quarter' }],
    effort: { flat: 4, perLocation: 0 },
  },
  {
    key: 'surveys', engine: 'retain', name: 'Board & staff surveys',
    summary: 'Early-warning signal on churn, per community and per team.',
    includes: ['Board satisfaction survey', 'Staff survey', 'Scorecards in your portal'],
    deliverables: [{ per: 'flat', qty: 2, unit: 'survey programs' }],
    effort: { flat: 3, perLocation: 0 },
  },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

// The sensible starting set for a new client — staff toggle from here.
export const DEFAULT_MODULES = ['foundation', 'tracking', 'reporting', 'portal', 'website', 'local-seo', 'gbp', 'seo-content', 'lead-routing', 'review-program'];

// Clamp a location count to something the doc can reason about.
export function normalizeLocations(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

// Keys → modules, in catalog order; unknown keys are dropped (an old row that
// names a retired module renders without it rather than crashing).
export function modulesFor(keys) {
  const set = new Set(Array.isArray(keys) ? keys : []);
  return MODULES.filter((m) => set.has(m.key));
}

// Modules grouped by engine (only engines that have something on).
export function groupByEngine(keys) {
  const mods = modulesFor(keys);
  return ENGINE_META
    .map((e) => ({ engine: e, modules: mods.filter((m) => m.engine === e.key) }))
    .filter((g) => g.modules.length);
}

// "3 profiles managed weekly" / "1 site build or refresh" — the client-facing
// line for one deliverable at N locations.
export function deliverableLine(d, locations) {
  const n = normalizeLocations(locations);
  const qty = d.per === 'location' ? d.qty * n : d.qty;
  const scaled = d.per === 'location' && n > 1 ? ` (${d.qty} × ${n} locations)` : '';
  return `${qty} ${d.unit}${scaled}${d.note ? ` · ${d.note}` : ''}`;
}
export function deliverableLines(mod, locations) {
  return (mod.deliverables || []).map((d) => deliverableLine(d, locations));
}

// Does this module grow with locations at all?
export function scalesWithLocations(mod) {
  return (mod.effort?.perLocation || 0) > 0 || (mod.deliverables || []).some((d) => d.per === 'location');
}

export function moduleEffort(mod, locations) {
  const n = normalizeLocations(locations);
  const e = mod.effort || { flat: 0, perLocation: 0 };
  return (e.flat || 0) + (e.perLocation || 0) * n;
}

export function totalEffort(keys, locations) {
  return modulesFor(keys).reduce((sum, m) => sum + moduleEffort(m, locations), 0);
}

export function effortByEngine(keys, locations) {
  return ENGINE_META.map((e) => ({
    engine: e,
    effort: modulesFor(keys).filter((m) => m.engine === e.key).reduce((s, m) => s + moduleEffort(m, locations), 0),
  })).filter((x) => x.effort > 0);
}

// How much more effort this plan is at N locations than at one — the number
// the doc leads with. multiplier is rounded to one decimal.
export function locationImpact(keys, locations) {
  const n = normalizeLocations(locations);
  const atOne = totalEffort(keys, 1);
  const atN = totalEffort(keys, n);
  const multiplier = atOne > 0 ? Math.round((atN / atOne) * 10) / 10 : 1;
  const scaling = modulesFor(keys).filter(scalesWithLocations).map((m) => m.key);
  return { locations: n, atOne, atN, multiplier, scalingModules: scaling };
}

// Effort at 1..max locations, for the little curve under the location count.
export function effortCurve(keys, max = 5) {
  const top = Math.max(1, Math.min(12, normalizeLocations(max)));
  const out = [];
  for (let n = 1; n <= top; n++) out.push({ locations: n, effort: totalEffort(keys, n) });
  return out;
}
