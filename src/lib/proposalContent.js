// ============================================================================
// Evergreen content for the client proposal page (v3, design handoff Oct 1
// 2026) — the copy that is the same on every proposal. The proposal RECORD
// supplies plans, markets, legal identity, contact and links.
// Hard rules: never "Most CAM companies grow by accident"; Alloy tracks FORM
// SUBMISSIONS only — never call tracking, recordings or phone access as a
// service (the rep's own phone number on the cover is contact info, not that).
// No em dashes in page copy (review round): use a period, comma, colon or
// parentheses instead.
// ============================================================================
export const COLORS = {
  purple: '#381c4f', purpleDeep: '#290d41', purple80: '#604a74', pink: '#d9356e', pinkHover: '#c12a60', pinkTint: '#fbe2eb',
  yellow: '#f5d880', yellowTint: '#fbf2d6', blue: '#a1c8e7', blueTint: '#dcecf7', green: '#aed7d0', greenTint: '#def0ec',
  offWhite: '#f8f7fc', lightGray: '#e8e4ef', borderStrong: '#c9c1d6', body: '#555555', muted: '#8a8395', ink: '#1a0a26',
};
export const MARKET_COLORS = [COLORS.yellow, COLORS.blue, COLORS.green, COLORS.pink, COLORS.purple80];

// ── cover ────────────────────────────────────────────────────────────────────
export const COVER_INTRO = 'Here’s what working with Alloy looks like: the results we plan for, what’s included, the investment, and how to get started. Review it, pick a plan, and accept when you’re ready.';
// "Questions? Text, call or email Cameron Lange." (verbs follow what we have)
export function contactLine(name, { phone, email } = {}) {
  const who = String(name || '').trim() || 'your Alloy team';
  const hasPhone = !!String(phone || '').trim();
  const hasEmail = !!String(email || '').trim();
  if (hasPhone && hasEmail) return `Questions? Text, call or email ${who}.`;
  if (hasPhone) return `Questions? Text or call ${who}.`;
  if (hasEmail) return `Questions? Email ${who}.`;
  return `Questions? Ask ${who} in the thread on this page.`;
}
// "(555) 555-0100" for display; "tel:+15555550100" for the link.
export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (n.length !== 10) return String(raw || '').trim();
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}
export function telHref(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  return `tel:+${d.length === 10 ? `1${d}` : d}`;
}

// ── 01 What you're buying ────────────────────────────────────────────────────
export const RESULTS = {
  eyebrow: 'Your three-year plan',
  h3: 'A plan to double your bottom line. A guarantee your investment will pay off.',
  p: 'A growth plan to create the outcomes you’ve always wanted.',
  cards: [
    { key: 'plan', k: 'The plan', num: 2, suffix: '×', color: COLORS.yellow, title: 'Your bottom line, doubled', sub: 'The target we are aiming at.' },
    { key: 'experience', k: 'The experience', num: 6, suffix: '×+', color: COLORS.green, title: 'Typical growth on what you invest', sub: 'What clients typically see.' },
    { key: 'floor', k: 'The floor', num: 1, suffix: '×', color: '#ffffff', title: 'Your growth covers our fees', sub: 'Guaranteed. We’re confident enough to back it with our money, not just yours.', guarantee: true },
  ],
  fine: 'Guarantee subject to the terms in the agreement.',
};
// "2×" when the count-up is done, "1.4×" on the way (one decimal).
export function resultNum(card, progress = 1) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  return p >= 1 ? `${card.num}${card.suffix}` : `${(card.num * p).toFixed(1)}×`;
}

// ── 02 What to expect ────────────────────────────────────────────────────────
export const BASELINE = {
  eyebrow: 'The baseline',
  h3: 'Everything a traditional agency does.',
  p: 'Every capability of a full-service digital marketing agency is included. We don’t sell it by the line item. We deploy what your plan calls for, when the data says to.',
  more: '+ whatever your plan calls for',
};
export const CAPABILITIES = ['SEO', 'Local SEO & maps', 'Google Business Profile', 'Paid search', 'Paid social', 'Retargeting', 'Social media', 'Website design & build', 'Landing pages', 'Conversion optimization', 'Content & blogs', 'Case studies', 'Reviews & reputation', 'Email & nurture', 'Brand & design', 'Print & collateral', 'RFP & board proposals', 'Sales enablement', 'Lead tracking', 'Analytics & reporting', 'AI search visibility', 'Video', 'Photography', 'Directory listings', 'Referral programs', 'Event marketing'];

export const DIFFERENCE = {
  eyebrow: 'The difference',
  h3a: 'What no other agency ',
  h3b: 'has.',
  p: 'Two things you can’t buy off the shelf: three growth programs built only for CAM, and a team that has lived the industry from the inside.',
  programsLabel: 'Three CAM programs · always running',
};
export const PROGRAMS = [
  { key: 'reach', name: 'Reach', paren: '(attract)', color: COLORS.blue, title: 'Boards find you first.', body: 'Comprehensive growth marketing in every market you manage, so boards find you before they start shopping.' },
  { key: 'match', name: 'Match', paren: '(close)', color: COLORS.yellow, title: 'Turn conversations into contracts.', body: 'Positioning, lead routing and a tailored proposal out the door the day a board asks.' },
  { key: 'retain', name: 'Retain', paren: '(keep)', color: COLORS.green, title: 'Protect the portfolio you have.', body: 'Reputation, board communication and staff retention strategies so renewals are the default, not a fight.' },
];

export const YEARS = {
  label: '35+ years inside CAM',
  p: 'We’ve sat in the board meetings, written the RFPs and trained thousands of managers and boards. Nobody learns your industry on your dime.',
  num: 35,
  title: 'Combined years inside community management.',
  sub: 'Lived from the manager’s chair, not studied from the outside.',
  stats: [{ n: '1,000s', l: 'Boards trained' }, { n: '100s', l: 'RFPs written' }],
};
export const EXPERTISE = [
  { color: COLORS.blue, title: 'Board psychology', body: 'How boards evaluate proposals, make decisions, and what builds trust.' },
  { color: COLORS.yellow, title: 'Pain points', body: 'From vendor turnover to proposal fatigue, we have lived the challenges managers face every day.' },
  { color: COLORS.green, title: 'Growth', body: 'We have helped management companies win more RFPs, secure long-term contracts and scale.' },
  { color: COLORS.pink, title: 'Board & homeowner education', body: 'We have trained thousands of boards, managers and residents to reduce friction and communicate better.' },
  { color: COLORS.blue, title: 'Team training', body: 'We have trained HOA teams on the day-to-day skills the job demands: compliance, communication, leadership, operations.' },
  { color: COLORS.yellow, title: 'The competition', body: 'We have studied why CAM companies lose bids, and built strategies to flip the outcome.' },
  { color: COLORS.green, title: 'What works', body: 'Our playbooks, processes and strategies are tested, proven and tailored to HOA management.' },
  { color: COLORS.pink, title: 'The language', body: 'The terms, compliance requirements and expectations that resonate with boards and managers.' },
  { color: COLORS.blue, title: 'Retention', body: 'Winning new associations is half the job. Keeping them year after year is the other half.' },
  { color: COLORS.yellow, title: 'Vendors', body: 'How to manage vendor relationships and turn partnerships into referral pipelines for new board opportunities.' },
];

export const PARTNER = {
  label: 'Preferred partner network',
  title: 'Boards already looking for a manager, introduced to you first.',
  logo: '/proposal-assets/match-hoa-logo.png',
  logoAlt: 'match HOA',
};
// "Alloy clients on Accelerate and Ascend are its preferred partners." — the
// plan names come from THIS proposal's match HOA plans (falls back to the tiers).
export function partnerBody(plans) {
  const names = (plans || []).filter((p) => p && p.matchHoa && p.show !== false).map((p) => p.name);
  const on = names.length ? names : ['Accelerate', 'Ascend'];
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  return `match HOA is where boards go to find a management company. Alloy clients on ${list} are its preferred partners. Warm introductions in your markets, before an RFP ever goes out.`;
}

// ── sidebar: samples (modals) + proof ────────────────────────────────────────
export const HOW_WE_WORK = {
  k: 'How we work', t: 'Sample planning documents',
  sub: 'Anonymized from another client. No two plans are alike. Yours is built around your markets, where your business is today, and what’s holding it back.',
};
export const THAT_IT_WORKS = { k: 'That it works', t: 'Proof from current clients' };
export const SAMPLES = [
  { key: 'roadmap', color: COLORS.yellow, tag: 'Sample · annual roadmap', title: 'Sample roadmap', sub: 'A year, quarter by quarter', detail: 'A year with Alloy runs in four quarters. Each one starts with a plan you approve, ends with a report on what moved, and hands the next quarter its targets.' },
  { key: 'playbook', color: COLORS.blue, tag: 'Sample · quarterly playbook', title: 'Sample playbook', sub: 'One quarter’s work, task by task', detail: 'The playbook is the quarter’s to-do list, in plain language. Every task is visible in your portal (status, category and progress) so you always know what we’re doing and why.' },
  { key: 'casestudy', color: COLORS.green, tag: 'Mini case study · one quarter', title: 'Mini case study', sub: 'What we ran, what moved', detail: 'One client, one quarter. The work we ran next to the numbers it moved.' },
];
export const SAMPLE_FOOT = 'Anonymized sample from an active partnership. Every plan is unique, built around the client’s markets, stage of business and current pain points.';

// Sample data for the modals (clearly labelled "sample" in the UI).
export const PREVIEW = {
  roadmapNote: 'Each quarter closes with a playbook for the next one and a report on this one. Both in your portal, both in plain language.',
  quarters: [
    { name: 'Q1', range: 'Nov – Jan', tag: 'Complete', tagBg: COLORS.greenTint, bg: '#f0faf7', dot: COLORS.green, done: true, focus: 'Foundation: pages, profiles, tracking live', count: '38', delivered: '38 of 38 delivered', pct: 100 },
    { name: 'Q2', range: 'Feb – Apr', tag: 'Complete', tagBg: COLORS.greenTint, bg: '#f0faf7', dot: COLORS.green, done: true, focus: 'Traction: rankings, first inbound boards', count: '61', delivered: '59 of 61 delivered', pct: 97 },
    { name: 'Q3', range: 'May – Jul', tag: 'In motion', tagBg: COLORS.yellowTint, bg: '#ffffff', dot: COLORS.yellow, done: false, focus: 'Momentum: authority content, review engine', count: '44', delivered: '12 of 44 delivered', pct: 27 },
    { name: 'Q4', range: 'Aug – Oct', tag: 'Up next', tagBg: '#ece8f1', bg: '#ffffff', dot: COLORS.purple, done: false, focus: 'Expansion: paid demand, referral pipeline', count: '—', delivered: 'Plan locks at Q3 review', pct: 0, dim: true },
  ],
  quarterStats: [
    { color: COLORS.pink, value: '+41%', label: 'Inbound board inquiries' },
    { color: COLORS.yellow, value: '3', label: 'Contracts signed from tracked leads' },
    { color: COLORS.green, value: '2 of 3', label: 'Markets in the top-3 map pack' },
  ],
  playbookHead: { title: 'Q3 2026 playbook', sub: '4 in motion · 75 delivered' },
  playbookRows: [
    { name: 'Develop website – city pages', cat: 'Web', catBg: COLORS.blueTint, status: 'In progress', statusBg: COLORS.yellowTint, pct: 80, barColor: COLORS.purple },
    { name: 'Resolve technical findings – Q3', cat: 'SEO', catBg: COLORS.blueTint, status: 'Assigned', statusBg: '#ece8f1', pct: 0, barColor: COLORS.purple },
    { name: 'Quarterly report – Q3', cat: 'Reporting', catBg: COLORS.greenTint, status: 'Planning', statusBg: '#ece8f1', pct: 10, barColor: COLORS.purple },
    { name: 'On-site SEO – Q3 cycle 3', cat: 'SEO', catBg: COLORS.blueTint, status: 'Delivered', statusBg: COLORS.greenTint, pct: 100, barColor: COLORS.green },
    { name: 'Review engine – all markets', cat: 'Retain', catBg: COLORS.greenTint, status: 'Delivered', statusBg: COLORS.greenTint, pct: 100, barColor: COLORS.green },
  ],
};

// ── 03 Investment: guarantee card ────────────────────────────────────────────
export const GUARANTEE = {
  eyebrow: 'Our guarantee',
  h1: 'Invest. Follow the program.',
  h2: 'Your results are guaranteed.',
  body: 'We’re so confident in the program that we back it with a money-back guarantee.',
  note: 'Guarantee terms and program requirements are in the agreement.',
};

// ── 04 Next steps ────────────────────────────────────────────────────────────
// Seasonal by design; staff can override it per proposal (Admin → Content).
export const NEXT_STEPS_TITLE = 'Say yes today. Boards find you before the new year.';
export const STEPS = (businessDays = 21) => [
  { n: '01', color: COLORS.pink, when: 'Today', title: 'Accept the proposal' },
  { n: '02', color: COLORS.yellow, when: 'This week', title: 'Welcome call' },
  { n: '03', color: COLORS.green, when: `Business day ${businessDays}`, title: 'Your first playbook' },
];
export const CTA_LABEL = 'Review terms and sign';
