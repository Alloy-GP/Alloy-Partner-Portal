// ============================================================================
// CAM profiles — the white-label identity behind the proposal system, per
// account. Everything a prospect could read as "which management company is
// this" lives here: name, logo, contact, team, tiers, onboarding, UVPs, and the
// per-concern prose. The board doc (board-proposal.jsx), the cockpit
// (screen-proposals.jsx), and the matcher (enrichLead) all read a profile via
// `camFor(accountId)` instead of hardcoding one company.
//
// CMGT is the DEFAULT (any real account resolves to it) and is assembled from
// the existing boardData/proposalMockData constants, so CMGT's live board renders
// byte-identical. NORTHSTAR is a fully fictional demo brand (see the Northstar
// demo account) — no real client's name, people, contact, UVPs, or prose.
// ============================================================================

import {
  UVPS as CMGT_UVPS,
  TIERS as CMGT_TIERS,
  TEAM as CMGT_TEAM,
  ONBOARDING_TIMELINE as CMGT_ONBOARDING,
} from './boardData.js';
// painProse + includes come from proposalMockData — that's the exact source
// enrichLead() already uses, so passing the CMGT profile changes nothing for CMGT.
import { INCLUDES as CMGT_INCLUDES, PAIN_PROSE as CMGT_PAIN_PROSE } from './proposalMockData.js';

export const CMGT_ACCOUNT_ID = '5126f05a-c6b9-49c5-b9e3-364a2e2c76ad';
export const DEMO_ACCOUNT_ID = 'de300000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// CMGT — the real pilot CAM. Wraps today's constants (nothing changes for it).
// ---------------------------------------------------------------------------
const CMGT_PROFILE = {
  key: 'cmgt',
  name: 'CMGT',
  shortName: 'CMGT',
  fullName: 'Community Management, LLC',
  tagline: 'We Manage. You Live.',
  logo: { light: '/proposal-assets/cmgt-logo.svg', dark: '/proposal-assets/cmgt-logo-white.svg' },
  contact: { web: 'cmgt.org', email: 'proposals@cmgt.org', phone: '(225) 791-1505' },
  team: CMGT_TEAM,
  tiers: CMGT_TIERS,
  onboarding: CMGT_ONBOARDING,
  includes: CMGT_INCLUDES,
  uvps: CMGT_UVPS,
  painProse: CMGT_PAIN_PROSE,
  // owner initials → the person the board hears from
  reps: {
    AB: { name: 'Amanda Betancourt', first: 'Amanda', role: 'COO' },
    JR: { name: 'Jordan R.', first: 'Jordan', role: 'Client Partnerships' },
  },
  ownerShort: { AB: 'Amanda B.', JR: 'Jordan R.' },
  ownerFirst: { AB: 'Amanda', JR: 'Jordan' },
  preparedBy: { name: 'Amanda Betancourt', role: 'COO' },
  discoveryLead: 'Jeff Harman (CEO & founder)',
  discoveryLeadFirst: 'Jeff',
  emailFromName: 'CMGT Community Management',
  footerBlurb: 'Community association management for the Gulf South. Family-run since 2007. CAI member · CMCA-credentialed team.',
  office: ['140 Aspen Square, Suite H', 'Denham Springs, LA 70726'],
  legalName: 'Community Management, LLC',
};

// ---------------------------------------------------------------------------
// NORTHSTAR — the fictional demo CAM. Generic, neutral-voice content.
// ---------------------------------------------------------------------------
const NORTHSTAR_UVPS = [
  { id: 'ns-comms', title: 'A team that answers — and follows through', short: 'Calls answered, and actually followed up', body: "Boards tell us the number-one frustration is silence. We're structured so the people fielding your community's calls aren't your manager juggling meetings — they're a support team whose whole job is to listen, route, and follow up until it's done.", icon: 'phone', category: 'Communication', tags: ['communication', 'responsiveness', 'after-hours', 'team-based'], proof: { value: '24 hrs', label: 'Callback standard' }, active: true },
  { id: 'ns-pod', title: 'One dedicated manager, backed by a full team', short: 'A single point of contact, never a single point of failure', body: 'You get one manager who knows your community — and behind them, specialist departments handling finances, collections, site visits, and homeowner support. Nothing stops because one person is busy, and you never start over when someone moves on.', icon: 'users', category: 'Team', tags: ['manager-turnover', 'stability', 'relationships', 'team-based', 'communication'], proof: { value: '1', label: 'Manager · backed by a team' }, active: true },
  { id: 'ns-transparency', title: 'Your books, open every month', short: 'Clear financials the board and homeowners can see', body: "You shouldn't have to ask where your money is. We send clear, plain-English financials to the board every month, and homeowners can see the same picture — so nobody's guessing about the association's health.", icon: 'trending-up', category: 'Financials', tags: ['transparency', 'reporting', 'financial'], proof: { value: 'Monthly', label: 'Financials to the board' }, active: true },
  { id: 'ns-tech', title: 'Software your board and homeowners actually use', short: 'A real portal and app, not a dusty PDF library', body: 'Your board can approve requests, review invoices, and pull governing documents in one place. Homeowners get a portal and app they actually use — which means more online payments and fewer phone calls for everyone.', icon: 'monitor', category: 'Technology', tags: ['tech', 'modern', 'reporting'], proof: { value: '24/7', label: 'Board & homeowner portal' }, active: true },
  { id: 'ns-proactive', title: 'Problems solved before they reach the board', short: 'Proactive management, not constant firefighting', body: 'Reactive management means the board spends every meeting chasing issues. We work the other way — scheduled site visits, ongoing vendor oversight, and reserves watched by a dedicated team — so the board meets to decide, not to react.', icon: 'sparkles', category: 'Service', tags: ['responsiveness', 'modern', 'maintenance'], proof: { value: 'Scheduled', label: 'Site-visit cadence' }, active: true },
  { id: 'ns-transition', title: 'A transition planned down to the day', short: 'Switching providers without the chaos', body: "Switching is the biggest risk on a board's plate, so we take the risk out: documents handed off, homeowners notified, financials transferred, credentials secured, and a clean go-live — all on a documented 90-day plan. You'll never wonder where the ball is.", icon: 'clipboard-check', category: 'Transition', tags: ['switching', 'transition', 'onboarding'], proof: { value: '90 days', label: 'Documented onboarding' }, active: true },
  { id: 'ns-collections', title: 'Delinquency handled — firmly and fairly', short: 'In-house collections with clear reporting', body: 'When homeowners understand where their assessments go, they pay. Our in-house team works late accounts with a steady, respectful process — and reporting so the board always knows exactly where things stand.', icon: 'scale', category: 'Financials', tags: ['delinquency', 'collections', 'financial'], proof: { value: 'In-house', label: 'Collections support' }, active: true },
  { id: 'ns-compliance', title: 'Covenant enforcement, handled with care', short: 'Educate first, enforce second', body: "Compliance is the part nobody loves. We lead with education so homeowners know the rules before they break them, and we process violations like a neighbor — not a court summons. Fair-housing and state requirements are watched by people whose job is to watch them.", icon: 'shield-check', category: 'Compliance', tags: ['compliance', 'covenant'], proof: { value: 'Educate', label: 'First, enforce second' }, active: true },
  { id: 'ns-vendors', title: 'Vendors managed, maintenance overseen', short: 'One point of accountability, not five contractors', body: "Vendor relationships are managed by a team that knows your community, with one point of accountability so you're not chasing contractors. We're paid by you, not by vendors — and we act like it.", icon: 'workflow', category: 'Service', tags: ['vendor-management', 'maintenance'], proof: { value: '1', label: 'Point of accountability' }, active: true },
  { id: 'ns-engagement', title: 'Homeowners who show up and pay on time', short: 'Transparency turns neighbors into participants', body: 'When homeowners can see where their money goes and what it does, they start to care — they pay on time, show up to meetings, and back the community. Open financials are the lever that fixes the homeowner relationship most communities struggle with.', icon: 'heart-handshake', category: 'Community', tags: ['transparency', 'communication'], proof: { value: 'Clear', label: 'Where every dollar goes' }, active: true },
  { id: 'ns-partner', title: 'A real partner to your volunteer board', short: 'We carry the weight the board shouldn’t', body: "You're volunteers with full-time lives. Our whole model exists so running the community feels less like a second job — your manager holds the relationship while the team handles the day-to-day. You get your time back.", icon: 'user-check', category: 'Team', tags: ['relationships', 'stability', 'team-based'], proof: { value: 'Yours', label: 'Time back to the board' }, active: true },
  { id: 'ns-local', title: 'Local expertise, handoff to homeowner control', short: 'Regional know-how and developer transitions', body: 'We know the practical realities of managing communities in this region — local codes, weather, and the details national firms underestimate — and we run new communities from setup through homeowner board turnover. Your community isn’t our experiment.', icon: 'home', category: 'Community', tags: ['regional', 'gulf-south', 'new-community', 'developer', 'transition'], proof: { value: 'Local', label: 'Regional expertise' }, active: true },
];

const NORTHSTAR_PAIN_PROSE = {
  'communication': { headline: 'When you call, someone answers — and follows up.', body: "You told us calls go unanswered. We're structured so the people fielding your community's calls aren't your manager juggling meetings — they're a support team whose job is to listen, route, and follow through.", metric: { value: '24 hrs', label: 'Callback standard' } },
  'delinquency': { headline: 'Collections that are firm and fair.', body: 'When homeowners understand where their assessments go, they pay. Our in-house team works late accounts with a steady, respectful process — and clear reporting so the board always knows where things stand.', metric: { value: 'In-house', label: 'Collections support' } },
  'manager-turnover': { headline: 'One manager who stays — backed by a team.', body: "Managers burn out when they're asked to do everyone's job. We're built the other way: your manager owns the relationship while specialist departments carry the load. That's why our people stay, and why you're not re-explaining your community every year.", metric: { value: '1', label: 'Dedicated manager · backed by a team' } },
  'transparency': { headline: 'Your books, open every month.', body: "You shouldn't need to ask where your money is. We send clear financials to the board every month, and homeowners can see the same picture — so nobody's guessing about the association's health.", metric: { value: 'Monthly', label: 'Financials to the board' } },
  'reactive': { headline: 'We solve problems before they reach you.', body: 'Reactive management is constant firefighting. We work the other way — scheduled site visits, vendor oversight, and reserves watched by a dedicated team — so the board meets to decide, not to chase.', metric: { value: 'Scheduled', label: 'Site-visit cadence' } },
  'switching': { headline: 'A transition planned down to the day.', body: "Switching providers is the biggest risk on a board's plate, so we take the risk out: documents handed off, homeowners notified, financials transferred, and a clean go-live — all on a documented 90-day plan. You'll never wonder where the ball is.", metric: { value: '90 days', label: 'Documented onboarding' } },
  'volunteer': { headline: "We carry the weight your board shouldn't.", body: "You're volunteers with full-time lives. Our model exists so running the community feels less like a second job — your manager holds the relationship while the team handles invoices, collections, site visits, and homeowner calls. You get your time back.", metric: { value: '1', label: 'Primary contact · backed by a team' } },
  'compliance': { headline: 'Covenant enforcement, handled with care.', body: 'Compliance is the part nobody loves. We lead with education so homeowners know the rules before they break them, and we process violations like a neighbor — not a court summons. Fair-housing and state requirements are watched by people whose job is to watch them.', metric: { value: 'Educate', label: 'First, enforce second' } },
  'tech': { headline: 'Software you actually want to log into.', body: 'Your board gets a real portal — approve requests, review invoices, and pull documents in one place. Homeowners get a portal and app they actually use, which means more online payments and fewer phone calls.', metric: { value: '24/7', label: 'Board & homeowner portal' } },
  'homeowner-apathy': { headline: 'Transparency turns homeowners into participants.', body: 'When homeowners can see where their money goes and what it does, they start to care — they pay on time, show up to meetings, and back the community. Clear, open financials are the lever that fixes the homeowner relationship.', metric: { value: 'Clear', label: 'Where every dollar goes' } },
  'vendor-issues': { headline: 'Fewer vendors. Clear accountability.', body: "Vendor relationships are managed by a team that knows your community, with one point of accountability so you're not chasing five contractors. We're paid by you, not by vendors — and we act like it.", metric: { value: '1', label: 'Point of accountability' } },
  'gulf-south': { headline: 'Local expertise you can count on.', body: 'We know the realities of managing communities in this region — local codes, weather, and the practical details national firms underestimate. Your community is not our experiment.', metric: { value: 'Local', label: 'Regional know-how' } },
  'developer': { headline: 'Developer-to-homeowner handoff, done right.', body: 'We run new communities from setup through board turnover — administrative setup, insurance, banking, and the operational handoff. The best signal we do it well: communities stay with us once they take control.', metric: { value: 'Setup', label: 'Through board turnover' } },
};

const NORTHSTAR_TEAM = [
  { name: 'Morgan Lee', role: 'Managing Partner', bio: 'Founded Northstar to run communities the way boards actually want. On your discovery call.', initials: 'ML', color: '#a1c8e7' },
  { name: 'Alex Brennan', role: 'Director of Operations', bio: 'Owns onboarding and day-to-day delivery. Personal check-in with every new board at Day 60.', initials: 'AB', color: '#74c275' },
  { name: 'Sam Carter', role: 'Director of Finance', bio: 'Runs the finance function — why your monthly statements land on time, every month.', initials: 'SC', color: '#f5d880' },
  { name: 'Jamie Ruiz', role: 'Client Partnerships', bio: 'Your main point of contact through the proposal and the transition.', initials: 'JR', color: '#3D1A52' },
];

const NORTHSTAR_TIERS = [
  { id: 'full', name: 'Full-Service Management', tagline: 'Recommended', recommended: true, pricingModel: 'Custom · based on homes, amenities, scope, and site-visit cadence', rateRange: '$4.50 – $25.00', setupFee: 0, setupCopy: "No setup fee. Your first month's management fee covers onboarding.", priceRange: '$4.50 – $25.00', priceUnit: 'per home / month · custom', includes: ['Dedicated manager + full support team', 'Complete financial management + monthly statements to all homeowners', 'Assessment collection + in-house collections', 'Board meeting prep, attendance, and minutes', 'Vendor coordination + maintenance oversight', 'Covenant enforcement with an educational-first approach', 'Annual budget + reserve planning', 'Board portal + homeowner mobile app', 'Insurance claim assistance'] },
  { id: 'financial', name: 'Financial & Administrative', tagline: 'For boards that want to keep hands on the day-to-day', pricingModel: 'Custom · based on homes, dues frequency, and document volume', rateRange: '$2.00 – $10.00', setupFee: 0, priceRange: '$2.00 – $10.00', priceUnit: 'per home / month · custom', monthlyEstimate: 'Quoted on request', includes: ['Assessment collection + bill payment', 'Monthly financial statements + reporting', 'Insurance monitoring', 'Board portal + homeowner communication', 'Record-keeping', 'No site visits — board handles physical oversight'] },
  { id: 'onsite', name: 'On-Site Management', tagline: 'For 500+ home communities and high-rises', pricingModel: 'Typically a flat fee', rateRange: '≈ $2,500 / month', setupFee: 0, priceRange: '≈ $2,500', priceUnit: 'per month · flat', monthlyEstimate: '≈ $2,500 / month', includes: ['Daily on-site manager presence', 'On-site maintenance and groundskeeping', 'Physical property oversight', 'In-person homeowner interaction', 'Compliance and violations handled in person', 'Financials and reporting handled by specialist departments'] },
];

const NORTHSTAR_ONBOARDING = [
  { day: 'Day 1', title: 'Documents handed off', body: 'All onboarding documents obtained from your previous management company.' },
  { day: 'Day 5', title: 'Homeowners introduced', body: 'Communications sent to all homeowners introducing Northstar.' },
  { day: 'Day 10', title: 'Financials in hand', body: 'Financial records and operational information obtained.' },
  { day: 'Day 15', title: 'Credentials secured', body: 'Balances confirmed, gate codes, fobs, and all credentials collected.' },
  { day: 'Day 20', title: 'Meet the team', body: 'Onboarding meeting — department leads attend so the board can ask questions and meet the team.' },
  { day: 'Day 30', title: 'Go live', body: 'Mail & email to homeowners. Contact transfers to your assigned manager.' },
  { day: 'Day 45', title: 'First site inspection', body: 'Inspection complete. Letter to homeowners on findings + quick reference guide.' },
  { day: 'Day 60', title: 'Leadership check-in', body: 'Managing Partner sends a personal welcome. Homeowners can log in and see last month’s financials.' },
  { day: 'Day 90', title: 'First violation round', body: 'First enforcement round complete, then a move to a regular cadence.' },
];

const NORTHSTAR_INCLUDES = [
  'Dedicated manager + full support team',
  'Assessment collection + in-house collections',
  'Vendor coordination + maintenance oversight',
  'Annual budget + reserve planning',
  'Insurance claim assistance',
  'Complete financial management + monthly statements to all homeowners',
  'Board meeting prep, attendance, and minutes',
  'Covenant enforcement with an educational-first approach',
  'Board portal + homeowner mobile app',
];

const NORTHSTAR_PROFILE = {
  key: 'northstar',
  name: 'Northstar Community Management',
  shortName: 'Northstar',
  fullName: 'Northstar Community Management',
  tagline: 'Your community, in good hands.',
  logo: null, // no asset → the board/cockpit render a text wordmark
  contact: { web: 'northstarcm.com', email: 'hello@northstarcm.com', phone: '(239) 555-0100' },
  team: NORTHSTAR_TEAM,
  tiers: NORTHSTAR_TIERS,
  onboarding: NORTHSTAR_ONBOARDING,
  includes: NORTHSTAR_INCLUDES,
  uvps: NORTHSTAR_UVPS,
  painProse: NORTHSTAR_PAIN_PROSE,
  reps: {
    AB: { name: 'Alex Brennan', first: 'Alex', role: 'Director of Operations' },
    JR: { name: 'Jamie Ruiz', first: 'Jamie', role: 'Client Partnerships' },
  },
  ownerShort: { AB: 'Alex B.', JR: 'Jamie R.' },
  ownerFirst: { AB: 'Alex', JR: 'Jamie' },
  preparedBy: { name: 'Alex Brennan', role: 'Director of Operations' },
  discoveryLead: 'Morgan Lee (Managing Partner)',
  discoveryLeadFirst: 'Morgan',
  emailFromName: 'Northstar Community Management',
  footerBlurb: 'Community association management, done with care. Locally owned and operated.',
  office: ['500 Gulfview Blvd, Suite 210', 'Fort Myers, FL 33901'],
  legalName: 'Northstar Community Management',
};

const PROFILES = { [DEMO_ACCOUNT_ID]: NORTHSTAR_PROFILE };

export const DEFAULT_CAM = CMGT_PROFILE;

// Resolve the CAM identity for an account. Any account that isn't a known demo
// resolves to CMGT (the pilot / default), preserving today's behavior.
export function camFor(accountId) {
  return (accountId && PROFILES[accountId]) || DEFAULT_CAM;
}
