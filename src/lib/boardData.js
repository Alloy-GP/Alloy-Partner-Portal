// ============================================================================
// Board proposal data — CMGT instance (the self-contained data layer behind the
// board-facing proposal document, ported verbatim from the v15 board/data.jsx).
//
// This is the design's tag-based model (UVPs with body+icon+tags, pain taxonomy,
// per-pain prose, tiers, team, 90-day timeline, matchUVPs). The board document
// (board-proposal.jsx) renders from THIS, driven by any portal lead via
// buildSubmission(lead). In production this loads per-CAM from the DB.
// ============================================================================

export const COLORS = {
  purple: "#2b2c6c", purpleDeep: "#1a1b4a", purple90: "#3D1A52", purple80: "#4a4d8a",
  purpleTint: "#e8ecf7", pink: "#3D1A52", pinkHover: "#2a1138", pinkTint: "#ece8f1",
  yellow: "#f5d880", blue: "#a1c8e7", green: "#74c275", greenTint: "#d4e7d4",
  offWhite: "#fafafa", white: "#ffffff", lightGray: "#e8e4ef", bodyGray: "#444444", fgMuted: "#8a8395",
  cmgtIndigo: "#2b2c6c", cmgtGreen: "#74c275", cmgtSoft: "#e8ecf7",
};

export const CAM_COMPANY = {
  name: "CMGT", fullName: "Community Management, LLC", shortName: "CMGT",
  tagline: "We Manage. You Live.", city: "Denham Springs, LA", founded: 2007,
  portfolios: 400, doors: 60000, managers: 91, retention: 96, states: 5, accreditation: "CAI Member · CMCA",
};

// UVPs come from the ONE canonical source (the backbone). Re-exported so the
// board document's `import { UVPS } from boardData` keeps working, and so a
// concern's `caps` indices reference the exact same array as the matcher.
import { UVPS } from "./proposalUVPs.js";
export { UVPS };

export const PAIN_POINTS = [
  { id: "communication", label: "Slow communication — missed calls, no follow-through", tags: ["communication", "responsiveness", "after-hours"] },
  { id: "delinquency", label: "Delinquency creeping up — collections aren't working", tags: ["delinquency", "collections", "financial"] },
  { id: "manager-turnover", label: "Manager turnover — constant relationship rebuilding", tags: ["manager-turnover", "stability", "relationships"] },
  { id: "transparency", label: "Financial opacity — we don't understand our own books", tags: ["transparency", "reporting", "tech", "financial"] },
  { id: "reactive", label: "Reactive management — problems only addressed after escalation", tags: ["responsiveness", "modern"] },
  { id: "switching", label: "Switching providers — worried about disruption", tags: ["switching", "transition", "onboarding"] },
  { id: "volunteer", label: "Volunteer burden — board is burning out", tags: ["communication", "responsiveness", "team-based"] },
  { id: "compliance", label: "Compliance pressure — fair housing, fiduciary, state law", tags: ["compliance", "covenant"] },
  { id: "tech", label: "Tech is dated — no real portal or app", tags: ["tech", "modern", "reporting"] },
  { id: "homeowner-apathy", label: "Homeowner apathy — no one sees the HOA's value", tags: ["transparency", "communication"] },
  { id: "vendor-issues", label: "Vendor management headaches", tags: ["vendor-management", "maintenance"] },
  { id: "gulf-south", label: "Need someone who knows Gulf South realities", tags: ["gulf-south", "regional"] },
  { id: "developer", label: "Developer-controlled community needing professional setup", tags: ["new-community", "developer", "transition"] },
];

// Per-pain prose (objects, not functions). headline + body + metric chip.
export const PAIN_PROSE = {
  "communication": { headline: "When you call, a human picks up. And follows through.", body: "You said your current company doesn't return calls. We measure call timeliness, and our portfolio average is 97%. That's not because we're fast — it's because the pod model means the people answering your community's calls aren't your CAM scrambling between meetings. They're a customer support team whose entire job is to listen, route, and follow up. Your CAM gets the headspace to actually think.", metric: { value: "97%", label: "Call timeliness rate" } },
  "delinquency": { headline: "Collections start with transparency, not threats.", body: "When homeowners see the financials — when they actually understand where their assessments go — they pay. Average delinquency across our portfolio sits at 10%, well below industry. Our in-house collections team handles late accounts the same way we handle everything: with compassion first. \"Your grass might be long. There might be something going on.\" Same posture, applied to dollars.", metric: { value: "10%", label: "Avg portfolio delinquency" } },
  "manager-turnover": { headline: "Your manager isn't carrying the whole job alone.", body: "The reason managers burn out in this industry is they're asked to do everyone else's job too. We're built differently from day one — your CAM is the relationship; specialist departments handle the load. That's why our team stays. ~91 people supporting ~400 communities, with department heads who've been with us for years. You learn your CAM. Your CAM learns your community.", metric: { value: "91", label: "Team members across 5 states" } },
  "transparency": { headline: "Your books, your dashboard, every homeowner — every month.", body: "Jeff came from financial counseling. He couldn't understand why a management company would hide financials from the people paying for them. We were one of the first nationally to send full monthly P&L and balance sheets to every homeowner — not just the board. Monthly financials hit by the 20th, every month. It's written into the management agreement.", metric: { value: "Day 20", label: "Monthly financials delivered" } },
  "reactive": { headline: "We try to solve problems before you know they exist.", body: "Reactive management means firefighting. We're built for the opposite — site visits on a cadence, vendor compliance monitored continuously, insurance and reserves handled by a dedicated department. The board meets to decide, not to chase. \"We don't just report the issue. We come with the solution.\"", metric: { value: "Daily", label: "Department standups" } },
  "switching": { headline: "Transition handled down to the day.", body: "Switching providers is the single biggest risk on a board's plate. Our 90-day onboarding is documented by day: docs handed off by Day 1, communications to homeowners by Day 5, financials in by Day 10, credentials by Day 15, a 20-day meeting with every department head, go-live at Day 30. The CEO emails you personally at Day 60. The COO follows up. You'll never wonder where the ball is.", metric: { value: "90 days", label: "Documented onboarding" } },
  "volunteer": { headline: "We carry the weight your board shouldn't be carrying.", body: "You're volunteers. You have full-time jobs and lives outside of this. The pod model exists for one reason: so that running a community feels less like a second job. Your CAM holds the relationship; AP processes invoices, AR chases delinquency, site visit specialists walk the property, customer support fields homeowner calls. You get your time back.", metric: { value: "1", label: "Primary contact · backed by a pod" } },
  "compliance": { headline: "Covenant enforcement, handled with compassion.", body: "Compliance is the part of this job nobody loves. We send an educational letter before the first violation round so homeowners know the rules before they break them. We process violations with the tone of a neighbor, not a court summons. ARC requests get reviewed by specialists. Fair housing, fiduciary, and state requirements are watched by people whose job is to watch them.", metric: { value: "Educate", label: "First, enforce second" } },
  "tech": { headline: "Software you actually want to log into.", body: "Vantaca powers your board portal, our mobile app, your homeowner experience, and our 2024 Vanty Award for Innovation. Board members can approve ARC requests, pay invoices, and pull governing documents in one place. Homeowners get a real portal and a real app — 70% of homeowners across our portfolio actually use it, and 56% of payments come through online.", metric: { value: "70%", label: "Active homeowner portal use" } },
  "homeowner-apathy": { headline: "Transparency turns homeowners into participants.", body: "When homeowners can see where their money goes, where it sits, and what it's doing — they start caring. They pay on time. They show up to meetings. They support the community. The full-membership financial transparency isn't just a values statement; it's the lever that fixes the homeowner relationship problem most communities have.", metric: { value: "Monthly", label: "P&L to every homeowner" } },
  "vendor-issues": { headline: "Fewer vendors. Same accountability. In-house option.", body: "Fix-It Squad — our in-house maintenance team — handles common area repairs for communities that want one number to call. For everything else, vendor relationships are managed by a team that knows your community. We don't get paid by vendors. We get paid by you, and we act like it.", metric: { value: "1", label: "Vendor relationship · one phone line" } },
  "gulf-south": { headline: "Largest in Louisiana. Largest on the Mississippi Gulf Coast.", body: "We've been managing Gulf South communities since 2007. We survived the 2016 Great Flood with a 4-day closure and came back stronger. We know FEMA zones, hurricane prep, local building codes, and the regional realities national firms underestimate. Your community is not our experiment.", metric: { value: "19 yrs", label: "Gulf South operations" } },
  "developer": { headline: "Developer-to-homeowner handoff, by a team that's done it.", body: "Our Developer Management Program runs new communities from groundbreaking through homeowner board turnover. Administrative setup, common area utilities, insurance, banking, the operational handoff — we own all of it. The best signal of how well we do this: most communities stay with us once they take control.", metric: { value: "DCM", label: "Dedicated team" } },
};

// Base tiers. The "full" tier's per-lead math (calcLine/monthlyTotal/annualTotal)
// is computed in buildSubmission from the lead's perHome × homes.
export const TIERS = [
  { id: "full", name: "Full-Service Management", tagline: "Recommended", recommended: true, pricingModel: "Custom · based on homes, amenities, scope, and site-visit cadence", rateRange: "$4.50 – $25.00", setupFee: 0, setupCopy: "No setup fee. Your first month's management fee covers our 30-day onboarding.", priceRange: "$4.50 – $25.00", priceUnit: "per home / month · custom", includes: ["Dedicated CAM + full pod (AP, AR, site visits, customer support, ARC)", "Complete financial management + monthly P&L to all homeowners", "Assessment collection + in-house collections team", "Board meeting prep, attendance, and minutes", "Vendor coordination + maintenance oversight", "Covenant enforcement with educational-first approach", "Annual budget + reserve planning", "Vantaca board portal + CMGT mobile app", "Insurance claim assistance"] },
  { id: "financial", name: "Financial & Administrative", tagline: "For boards that want to keep hands on the day-to-day", pricingModel: "Custom · based on homes, dues frequency, and document volume", rateRange: "$2.00 – $10.00", setupFee: 0, priceRange: "$2.00 – $10.00", priceUnit: "per home / month · custom", monthlyEstimate: "Quoted on request", includes: ["Assessment collection + bill payment", "Monthly financial statements + reporting", "Insurance monitoring", "Vantaca portal + homeowner communication platform", "Record-keeping (board takes photos, we process and store)", "No site visits — board handles physical oversight"] },
  { id: "onsite", name: "On-Site Management", tagline: "For 500+ home communities and high-rises", pricingModel: "Typically a flat fee around $2,500 / month", rateRange: "≈ $2,500 / month", setupFee: 0, priceRange: "≈ $2,500", priceUnit: "per month · flat", monthlyEstimate: "≈ $2,500 / month", includes: ["Daily on-site CAM presence", "On-site maintenance and groundskeeping team", "Physical property oversight (site inspections, vendor monitoring)", "In-person homeowner interaction", "Compliance and violations handled in person", "Financials, reporting, and ARC still handled by specialist departments", "On-site team payroll billed to the HOA as a bi-weekly reimbursement"] },
];

export const TEAM = [
  { name: "Jeff Harman", role: "CEO & Founder", bio: "Founded CMGT in 2007. Built the pod model. Will be on your discovery call.", initials: "JH", color: "#74c275" },
  { name: "Amanda Betancourt", role: "COO", bio: "Operations and marketing. Personal check-in with every new board at Day 60.", initials: "AB", color: "#a1c8e7" },
  { name: "Ashley Melancon", role: "CFO", bio: "Runs the finance function. Why your monthly P&L hits by the 20th, every month.", initials: "AM", color: "#f5d880" },
  { name: "Chris Tremblay", role: "Chief Real Estate Officer", bio: "13 years with CMGT. Brought our first rental properties; now runs developer relationships.", initials: "CT", color: "#3D1A52" },
];

export const ONBOARDING_TIMELINE = [
  { day: "Day 1", title: "Documents handed off", body: "All onboarding documents obtained from your previous management company." },
  { day: "Day 5", title: "Homeowners introduced", body: "Communications sent to all homeowners introducing CMGT." },
  { day: "Day 10", title: "Financials in hand", body: "Financial records and operational information obtained." },
  { day: "Day 15", title: "Credentials secured", body: "Beginning balance checks, homeowner balances confirmed, gate codes, fobs, all credentials." },
  { day: "Day 20", title: "Meet every department", body: "20-day onboarding meeting — all department supervisors attend so the board can ask questions and meet the team." },
  { day: "Day 30", title: "Go live", body: "Mail & email to homeowners. Contact transfers from Onboarding Team to your assigned CAM." },
  { day: "Day 45", title: "First site inspection", body: "Inspection complete. Letter to homeowners on findings + quick reference guide created." },
  { day: "Day 60", title: "CEO welcome", body: "CEO sends personal welcome. COO checks in. Homeowners can log in and see last month's financials." },
  { day: "Day 90", title: "First violation round", body: "First enforcement round complete. CAM Supervisor follows up at Day 120, then moves to semi-annual." },
];

// The matching engine — tag overlap between selected pains and UVPs.
export function matchUVPs(selectedPainIds, painList = PAIN_POINTS, uvps = UVPS) {
  const selectedPains = painList.filter((p) => selectedPainIds.includes(p.id));
  const painTagSet = new Set(selectedPains.flatMap((p) => p.tags));
  const scored = uvps.map((uvp) => {
    const matchingTags = uvp.tags.filter((t) => painTagSet.has(t));
    const matchingPains = selectedPains.filter((p) => p.tags.some((t) => uvp.tags.includes(t)));
    return { ...uvp, score: matchingTags.length, matchingTags, matchingPains };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

const fmt2 = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Map a portal lead → the board `submission` shape + a per-lead tiers array (so
// the recommended-tier math reflects this lead's homes × per-home rate).
export function buildSubmission(lead) {
  const monthly = (lead.perHome || 0) * lead.homes;
  const tiers = TIERS.map((t) => t.id !== "full" ? t : {
    ...t,
    tagline: `Recommended for ${lead.shortName || lead.community}`,
    quotedRate: lead.perHome, monthlyTotal: monthly, annualTotal: monthly * 12,
    calcLine: `${fmt2(lead.perHome)} per home × ${lead.homes} homes = ${fmt2(monthly)} / month`,
    monthlyEstimate: `${fmt2(monthly)} / month`, annualEstimate: `${fmt2(monthly * 12)} / year`,
  });
  return {
    association: lead.community,
    shortName: lead.shortName || lead.community,
    city: lead.city,
    type: lead.metaType,
    units: lead.homes,
    currentStatus: lead.metaStatus,
    contactName: lead.contact,
    contactRole: lead.contactRole,
    contactEmail: lead.email,
    contactPhone: lead.phone,
    budgetRange: lead.budget,
    timeline: lead.engageTimeline,
    selectedPains: lead.selectedPains || [],
    narrative: lead.quote,
    submittedAt: lead.received,
    proposalId: lead.id,
    dateIssued: (lead.received || "").split(" · ")[0] || "May 23, 2026",
    validThrough: "June 22, 2026",
    recommendedTierId: lead.recommendedTierId || "full",
    tiersToShow: lead.tiersToShow || ["full"],
    leadCAM: null,
    preparedBy: { name: "Amanda Betancourt", role: "COO" },
    tiers,
  };
}
