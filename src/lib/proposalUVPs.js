// ============================================================================
// UVP LIBRARY — the backbone of the proposal system.
//
// A UVP is a CAM's reusable value proposition / capability. EVERYTHING keys off
// this list: the matcher maps a board's pain points to UVPs, the proposal
// renders the matched UVPs' prose, and proof points come from each UVP's metric.
//
// THIS is the single source of truth (CMGT's instance). The cockpit matcher
// (proposalMockData.js) and the board document (boardData.js) both import from
// here — so a concern's `caps` indices reference one array and can never drift.
//
// Each UVP carries everything every surface needs:
//   id        stable slug (never reindex — `caps` reference array position)
//   title     the capability name
//   short     one-line summary (match-detail blurb, tier teasers)
//   body      the full paragraph shown on the board proposal
//   icon      lucide-style glyph name (board card)
//   category  grouping for the library (operations / financial / tech / …)
//   tags      deterministic-match keywords (also the LLM's structured hints)
//   proof     { value, label } — the canonical evidence for this capability
//   active    in the library (false = retired, hidden from new matches)
//
// In production this loads per-CAM from a `uvps` table, editable by the client
// (each client's UVPs are unique). The UVP Library screen is that editor's seed.
// ============================================================================

export const UVPS = [
  { id: "pod", title: "Team-based pod model", category: "operations", icon: "users",
    short: "Your CAM, backed by an entire department for every job they're not doing themselves",
    body: "Most management companies give you one manager and pile every responsibility on their desk. We built CMGT differently from day one — your CAM is the brain and the face of your community, with specialist departments (AP, AR, site visits, customer support, ARC) operating around them like a pod. When your CAM is at your board meeting, the finance team is still processing your invoices. Nothing stops because one person is busy.",
    tags: ["communication", "responsiveness", "manager-turnover", "team-based", "modern"],
    proof: { value: "1", label: "Primary contact · backed by a pod" }, active: true },
  { id: "gulf-south", title: "Gulf South regional expertise", category: "credibility", icon: "home",
    short: "19 years managing communities in conditions national firms underestimate",
    body: "We're the largest HOA management company in Louisiana and the largest on the Mississippi Gulf Coast. We've managed communities through hurricanes, the 2016 Great Flood, and every kind of Gulf South reality. Our team lives where you live. We don't have to learn FEMA flood zones on the fly — we've been here since 2007.",
    tags: ["gulf-south", "regional", "credibility", "trust"],
    proof: { value: "19 yrs", label: "Gulf South operations" }, active: true },
  { id: "technology", title: "Technology that lets humans be more human", category: "tech", icon: "monitor",
    short: "Vantaca-powered, with the 2024 Vanty Award for Innovation to prove it",
    body: "Your board portal isn't a chore. It's a digital office where you approve ARC requests, pay vendor invoices, pull governing documents, and see real-time financials in one click. Behind the scenes, a single dedicated finance team member delivers monthly financials for 350+ associations by the 20th of every month. That's the efficiency tech-forward operations buy you.",
    tags: ["tech", "modern", "transparency", "reporting", "communication"],
    proof: { value: "70%", label: "Active homeowner portal use" }, active: true },
  { id: "transparency", title: "Radical financial transparency", category: "financial", icon: "scale",
    short: "Full monthly P&L sent to every homeowner — not just the board",
    body: "We were one of the first companies in the country to send monthly financial statements to the entire ownership, not just the board. Jeff came from a financial counseling background and couldn't understand why the people paying for management weren't allowed to see where the money went. When homeowners see where their dollars sit, they pay assessments on time. Delinquency drops. Trust in the HOA goes up.",
    tags: ["transparency", "delinquency", "financial", "reporting"],
    proof: { value: "Day 20", label: "Monthly financials delivered" }, active: true },
  { id: "organic", title: "100% organic growth — no PE backing", category: "values", icon: "heart-handshake",
    short: "Every one of our 400 communities chose us. No acquisitions, no roll-ups, no investors.",
    body: "Boards that have been through a management-company acquisition know the pain — new systems, new contacts, new processes imposed without consent. CMGT has grown 100% organically since 2007. Jeff has declined every PE offer that's come to the door. \"If my kids don't take the company from me one day, my employees will.\" Your relationship with us is a relationship — not an asset on someone's balance sheet.",
    tags: ["independent", "trust", "values", "long-term", "relationships"],
    proof: { value: "400", label: "Communities · none acquired" }, active: true },
  { id: "communication", title: "The best communication company that happens to do management", category: "service", icon: "phone",
    short: "97% timeliness rate on answering calls — measured, not promised",
    body: "It's not enough to be available. You also have to be human. Jeff says the industry too often treats people like clients, customers, or paying members. We see homeowners as homeowners and boards as the volunteers they are. Communication is consistent AND compassionate. \"Your grass might be long — there might be something going on.\" That's the tone.",
    tags: ["communication", "responsiveness", "after-hours"],
    proof: { value: "97%", label: "Call timeliness rate" }, active: true },
  { id: "transition", title: "A 90-day onboarding documented down to the day", category: "transition", icon: "workflow",
    short: "Day 1 to Day 90 — you'll know what's happening, when, and who's doing it",
    body: "Most boards have been burned by a switch. We onboard so structurally that you'll never wonder where we are: communications out by Day 5, financials by Day 10, all credentials by Day 15, a 20-day onboarding meeting with every department head, go-live at Day 30, first inspection by Day 45, the CEO sending a personal welcome by Day 60. It's not a script. It's how we operate.",
    tags: ["transition", "onboarding", "switching", "communication"],
    proof: { value: "90 days", label: "Documented onboarding" }, active: true },
  { id: "collections", title: "Collections built on transparency, not pressure", category: "financial", icon: "trending-up",
    short: "10% average delinquency across the portfolio — and homeowners know why they're paying",
    body: "When homeowners see the financials and understand where their money goes, they pay. We don't lead with threats. We lead with visibility — and the numbers follow. Average delinquency across our managed communities is 10%, which is well below industry. We have an in-house team that handles collections the same way we handle everything else: interactional, not transactional.",
    tags: ["delinquency", "collections", "financial", "transparency"],
    proof: { value: "10%", label: "Avg portfolio delinquency" }, active: true },
  { id: "remote", title: "Born remote — born to scale", category: "operations", icon: "git-branch",
    short: "Our 91-person team is fully remote, with the Best Places to Work award to prove it",
    body: "The 2016 Great Flood took two feet of water through our office. By necessity, we went fully remote — and discovered we could deliver better service and stay more culturally connected than we ever did with everyone in one building. COVID just confirmed what the flood proved. Your local CAM lives in your area; our specialist departments are everywhere. The overhead savings stay with you, not with a corner office.",
    tags: ["modern", "values", "stability"],
    proof: { value: "91", label: "Fully-remote team, 5 states" }, active: true },
  { id: "fix-it", title: "Fix-It Squad — in-house maintenance", category: "operations", icon: "shield-check",
    short: "Common area repairs by a team that answers to the same company that manages your community",
    body: "Our Fix-It Squad isn't a vendor we like — it's us. Same accountability structure, same standards, same response time. Fewer vendors for your board to manage, faster turnaround on the maintenance issues that matter, and one phone number for everything in your community.",
    tags: ["vendor-management", "maintenance", "responsiveness"],
    proof: { value: "1", label: "Phone line for repairs + vendors" }, active: true },
  { id: "developer", title: "Developer-controlled management", category: "transition", icon: "git-branch",
    short: "Setup through homeowner turnover — handled by a team that's done it 100+ times",
    body: "Our Developer Management division partners with builders from groundbreaking through homeowner turnover. We handle the administrative setup, common area utilities, insurance, banking, and the operational handoff. Most communities stay with us after turnover — because we built the foundation right.",
    tags: ["new-community", "developer", "transition"],
    proof: { value: "100+", label: "Developer turnovers handled" }, active: true },
  { id: "compliance", title: "Compliance handled with compassion", category: "operations", icon: "clipboard-check",
    short: "Educational letters before first violations — because most homeowners didn't know",
    body: "We send educational letters before the first violation round in any new community. \"We used to not do that — people would say I didn't know we weren't able to do that.\" Now we explain first, enforce second. Covenant enforcement is part of the job, but the tone of how it's done is what separates a community from a courtroom.",
    tags: ["compliance", "covenant", "communication"],
    proof: { value: "Educate", label: "First, enforce second" }, active: true },
  { id: "values", title: "People-first, every position", category: "people", icon: "user-check",
    short: "Every CMGT job description has a value statement — what they do, why it matters",
    body: "Jeff originally built CMGT with process and product first, people last — and lost good managers because of it. The order is flipped now: people first. \"If you hire great people, give them great tools, and pour into them, they will make the processes great, which makes the product great.\" Every position has a value statement on the job description. It's why our team stays.",
    tags: ["manager-turnover", "stability", "values"],
    proof: { value: "96%", label: "Team retention" }, active: true },
  { id: "innovation", title: "Built on innovation, driven by results", category: "tech", icon: "sparkles",
    short: "The Vanty Award winner and one of the first to push AI-assisted operations",
    body: "We won Vantaca's 2024 Vanty Award for Innovation for the operational and financial efficiencies our team built. Jeff is now pushing the company hard into AI — the long-term vision is an assistant for every role, so our humans can spend more time being human with boards and homeowners. \"We want to turn doers into thinkers, and let the AI be the doers.\"",
    tags: ["tech", "modern", "innovation"],
    proof: { value: "2024", label: "Vanty Award · Innovation" }, active: true },
];

// Index-aligned views the matcher + cockpit consume. (Index = array position;
// a concern's `caps` are these indices, so never reorder — append + retire only.)
export const UVP_TITLES = UVPS.map((u) => u.title);
export const UVP_BLURBS = UVPS.reduce((m, u, i) => ((m[i] = u.short), m), {});

export const uvpById = (id) => UVPS.find((u) => u.id === id);
export const UVP_CATEGORIES = [...new Set(UVPS.map((u) => u.category))];
