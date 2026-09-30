// ============================================================================
// Evergreen content for the client proposal page — the copy that is the same
// on every proposal (the proposal RECORD supplies plans, markets, legal, links).
// Hard rules (from the design handoff): never "Most CAM companies grow by
// accident"; Alloy tracks FORM SUBMISSIONS only — never call tracking,
// recordings or phone access. Keep both true in every string here.
// ============================================================================
import { modulesFor } from './engagementCatalog.js';

export const COLORS = {
  purple: '#381c4f', purpleDeep: '#290d41', purple80: '#604a74', pink: '#d9356e', pinkHover: '#c12a60', pinkTint: '#fbe2eb',
  yellow: '#f5d880', yellowTint: '#fbf2d6', blue: '#a1c8e7', blueTint: '#dcecf7', green: '#aed7d0', greenTint: '#def0ec',
  offWhite: '#f8f7fc', lightGray: '#e8e4ef', borderStrong: '#c9c1d6', body: '#555555', muted: '#8a8395', ink: '#1a0a26',
};
export const MARKET_COLORS = [COLORS.yellow, COLORS.blue, COLORS.green, COLORS.pink, COLORS.purple80];

export const SUMMARY_PARAGRAPH = 'This plan is one growth system that attracts boards, closes contracts and keeps the communities you have — running in every market you manage, tracked in one portal. We start day one, and you see every move.';

export const WE_KNOW_CAM = {
  intro: 'We are not a marketing agency learning your industry on your dime. We have sat in the board meetings, written the RFP responses, and built the education and training that thousands of boards, managers and HOA teams have gone through. That is what makes this plan specific to boards, not generic to “local business.”',
  years: 35,
  yearsLabel: 'Combined years in CAM',
};

export const EXPERTISE = [
  { color: COLORS.blue, title: 'Board psychology', body: 'How boards evaluate proposals, make decisions, and what builds trust.' },
  { color: COLORS.yellow, title: 'Pain points', body: 'From vendor turnover to proposal fatigue, we have lived the challenges managers face every day.' },
  { color: COLORS.green, title: 'Growth', body: 'We have helped management companies win more RFPs, secure long-term contracts and scale.' },
  { color: COLORS.pink, title: 'Board & homeowner education', body: 'We have trained thousands of boards, managers and residents to reduce friction and communicate better.' },
  { color: COLORS.blue, title: 'Team training', body: 'We have trained HOA teams on the day-to-day skills the job demands — compliance, communication, leadership, operations.' },
  { color: COLORS.yellow, title: 'The competition', body: 'We have studied why CAM companies lose bids, and built strategies to flip the outcome.' },
  { color: COLORS.green, title: 'What works', body: 'Our playbooks, processes and strategies are tested, proven and tailored to HOA management.' },
  { color: COLORS.pink, title: 'The language', body: 'The terms, compliance requirements and expectations that resonate with boards and managers.' },
  { color: COLORS.blue, title: 'Retention', body: 'Winning new associations is half the job. Keeping them year after year is the other half.' },
  { color: COLORS.yellow, title: 'Vendors', body: 'How to manage vendor relationships and turn partnerships into referral pipelines for new board opportunities.' },
];

// The four outcome cards. Evergreen title/body; the chips are the modules
// switched on for this proposal, grouped by engine.
const OUTCOME_DEFS = [
  { engine: 'reach', tag: 'Be found first', color: COLORS.blue, scale: 'Every market', title: 'Found before boards shop.', body: 'Search-first site with a page per market, Google profiles managed weekly, and citations cleaned up everywhere a board could look.' },
  { engine: 'match', tag: 'Win the RFP', color: COLORS.yellow, scale: 'Every market', title: 'Answer the day they ask.', body: 'One request-a-proposal form, routed to the right person per market, and a tailored board proposal out the door in minutes.' },
  { engine: 'retain', tag: 'Keep every board', color: COLORS.green, scale: 'Every market', title: 'Keep the boards you have.', body: 'A review engine in every market — requests, responses and monitoring — so reputation compounds where boards actually vote.' },
  { engine: 'core', tag: 'Know what moved', color: COLORS.pink, scale: 'One portal', title: 'See every lead and dollar.', body: 'Every form submission traced to its market. Monthly reports, quarterly playbooks, and a strategist call each quarter.' },
];
export function outcomesFor(moduleKeys) {
  const mods = modulesFor(moduleKeys);
  return OUTCOME_DEFS.map((o) => ({ ...o, chips: mods.filter((m) => m.engine === o.engine).map((m) => m.name) }))
    .filter((o) => o.chips.length || o.engine === 'core');
}

export const STAGES = [
  { n: '1', color: COLORS.pink, fg: '#ffffff', name: 'Foundation', when: 'Days 1–21', goal: 'Everything a market needs to be found, tracked and answered.' },
  { n: '2', color: COLORS.yellow, fg: COLORS.purple, name: 'Traction', when: 'Months 2–4', goal: 'First rankings, first tracked inquiries, first reviews flowing.' },
  { n: '3', color: COLORS.blue, fg: COLORS.purple, name: 'Momentum', when: 'Months 4–7', goal: 'Pipeline becomes predictable and the numbers start compounding.' },
  { n: '4', color: COLORS.green, fg: COLORS.purple, name: 'Expansion', when: 'Months 7–10', goal: 'Widen reach in the market and press where the data says to.' },
  { n: '5', color: COLORS.purple, fg: '#ffffff', name: 'Dominance', when: 'Month 10+', goal: 'The name boards mention first — and keep renewing.' },
];

export const TOPICS = [
  { key: 'journey', color: COLORS.pink, pillBg: COLORS.pinkTint, tag: 'Roadmap', scope: 'Per market', title: 'The growth journey', blurb: 'Five stages every market moves through, from groundwork to the name boards say first.',
    detail: 'Every market runs the same five-stage journey on its own track. You will see exactly which stage each market is in, what cleared, and what is next — no guessing where things stand.',
    expect: ['A visible stage and milestone tracker for each market', 'Stages advance when milestones clear, not on a calendar', 'One combined roadmap across all your markets in your portal'], perMarket: true, scopeLabel: 'Runs in', portal: 'Portal: Growth roadmap' },
  { key: 'playbook', color: COLORS.yellow, pillBg: COLORS.yellowTint, tag: 'Strategy', scope: 'Quarterly', title: 'The quarterly playbook', blurb: 'Every task we run, visible in one place. Every quarter we audit, decide and write it down.',
    detail: 'The playbook is the working plan for the next 90 days. It starts with a growth audit of what happened last quarter, sets targets per market, and lists exactly what we will build and why. You approve it before we run it.',
    expect: ['A growth audit and written playbook every quarter', 'Targets set market by market', 'A review call to walk through it together', 'Changes mid-quarter when the data says so'], perMarket: true, scopeLabel: 'Written for', portal: 'Portal: Quarterly playbook, live from our project board' },
  { key: 'leads', color: COLORS.blue, pillBg: COLORS.blueTint, tag: 'Pipeline', scope: 'Per market', title: 'Leads & pipeline', blurb: 'Every form submission traced to its market and source, then qualified in one click.',
    detail: 'Each market has its own form route, so every inbound board is tied to where it came from. Leads land in your portal queue; you mark them qualified or not, and that feeds what we do next.',
    expect: ['Every form submission in one queue', 'Source and market on every lead', 'One-click qualification that tunes the plan', 'Lead value tied back to signed contracts'], perMarket: true, scopeLabel: 'Tracked in', portal: 'Portal: Lead queue' },
  { key: 'reporting', color: COLORS.green, pillBg: COLORS.greenTint, tag: 'Visibility', scope: 'Monthly', title: 'Reporting & the portal', blurb: 'You always know what we did, what moved, and what is next — without asking.',
    detail: 'Your portal is the live view of the partnership: roadmap, playbook, leads, reports, inbox and billing in one place, every seat on your team. A monthly report lands on the same day each month and says what changed in plain language.',
    expect: ['A monthly report in plain language, same day each month', 'Live roadmap and lead data any time you open the portal', 'Every seat on your team, no per-user fee', 'Billing and invoices in the same place'], perMarket: false, scopeLabel: 'Covers all your markets', portal: 'Portal: Reports & billing' },
  { key: 'you', color: COLORS.purple, pillBg: '#ece8f1', tag: 'Your part', scope: 'Light lift', title: 'What we need from you', blurb: 'A short interview up front, then quick approvals. Follow the program and the guarantee holds.',
    detail: 'The program works when it runs. Your side is small but real: give us access to your site and Google accounts in the first week, sit for one positioning interview, approve what we publish, and qualify leads as they come in. Reviewing is easy — you open it in the portal, leave comments, and approve. That is what keeps the guarantee in force.',
    expect: ['Site and Google account access in week one', 'One positioning interview', 'Review and approve anything we publish — open it, comment, approve', 'Qualify leads in your portal as they arrive'], perMarket: false, scopeLabel: 'Applies across', portal: 'Terms and requirements are in the agreement' },
];

// Sample data for the modal previews (clearly labelled "sample" in the UI).
export const PREVIEW = {
  quarters: [
    { name: 'Q4', range: 'Nov – Dec', tag: 'Complete', tagBg: COLORS.greenTint, bg: '#f0faf7', dot: COLORS.green, done: true, count: '38', delivered: '38 of 38 delivered', pct: 100, links: ['Playbook', 'Report'] },
    { name: 'Q1', range: 'Jan – Mar', tag: 'Complete', tagBg: COLORS.greenTint, bg: '#f0faf7', dot: COLORS.green, done: true, count: '61', delivered: '59 of 61 delivered', pct: 97, links: ['Playbook', 'Report'] },
    { name: 'Q2', range: 'Apr – Jun', tag: 'In motion', tagBg: COLORS.yellowTint, bg: '#ffffff', dot: COLORS.yellow, done: false, count: '44', delivered: '12 of 44 delivered', pct: 27, links: ['Playbook'] },
    { name: 'Q3', range: 'Jul – Sep', tag: 'Up next', tagBg: '#ece8f1', bg: '#ffffff', dot: COLORS.purple, done: false, count: '—', delivered: 'Plan locks at kickoff', pct: 0, dim: true, links: [] },
  ],
  leadRows: [
    { name: 'Andrea H.', assoc: 'Wrenwood POA', src: 'Google', srcColor: COLORS.purple, market: 'Market 2', units: '67' },
    { name: 'Karla H.', assoc: 'The Bluffs POA', src: 'AI', srcColor: COLORS.pink, market: 'Market 3', units: '400' },
  ],
  sources: [{ label: 'Google', pct: 60, color: COLORS.purple }, { label: 'AI', pct: 24, color: COLORS.pink }, { label: 'Referral', pct: 13, color: COLORS.yellow }, { label: 'Other', pct: 3, color: COLORS.blue }],
  playbookRows: [
    { name: 'Develop website – city pages', cat: 'Web', catBg: COLORS.blueTint, status: 'In progress', statusBg: COLORS.yellowTint, pct: 80, barColor: COLORS.purple },
    { name: 'Resolve technical findings – Q3', cat: 'SEO', catBg: COLORS.blueTint, status: 'Assigned', statusBg: '#ece8f1', pct: 0, barColor: COLORS.purple },
    { name: 'Quarterly report – Q3', cat: 'Reporting', catBg: COLORS.greenTint, status: 'Planning', statusBg: '#ece8f1', pct: 10, barColor: COLORS.purple },
    { name: 'On-site SEO – Q3 cycle 3', cat: 'SEO', catBg: COLORS.blueTint, status: 'Delivered', statusBg: COLORS.greenTint, pct: 100, barColor: COLORS.green },
    { name: 'Website launched', cat: 'Web', catBg: COLORS.blueTint, status: 'Delivered', statusBg: COLORS.greenTint, pct: 100, barColor: COLORS.green },
  ],
};

export const NEXT_STEPS = (preparerFirst, hasCalendar) => [
  { n: '1', color: COLORS.pink, when: 'Today', title: 'You accept', body: 'Read the agreement, add your name, done. No printed contract, no chasing signatures.' },
  { n: '2', color: COLORS.yellow, when: 'Within minutes', title: 'Your portal opens', body: 'Playbook, roadmap, leads and your Alloy inbox — every seat on your team.' },
  { n: '3', color: COLORS.blue, when: 'This week', title: 'Autopay + welcome call', body: `Add a bank account once. ${hasCalendar ? 'Pick a welcome-call time that suits you' : `${preparerFirst} proposes times for the welcome call`}, and nothing drafts before you confirm.` },
  { n: '4', color: COLORS.green, when: 'Day 21', title: 'First playbook', body: '21 business days after the welcome call: brief, research, audit, content map, sitemap — and your first playbook.' },
];

export const GUARANTEE = {
  eyebrow: 'Our guarantee',
  h1: 'Invest. Follow the program.',
  h2: 'Your results are guaranteed.',
  body: 'If your growth doesn’t cover our fees, we give you a refund.',
  note: 'Guarantee terms and program requirements are in the agreement.',
};
