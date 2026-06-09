// Mock data for Alloy Client Portal
export const DATA = {
  user: { name: "Rim", initials: "R", role: "owner" },
  account: {
    company: "RISE Association Management Group",
    shortName: "RISE",
    tier: "Accelerate",
    market: "Austin–Round Rock TX",
    since: "Mar 2025",
  },
  // Recurring services — pulled from client config. Always-on engagements that show alongside one-off projects.
  recurringServices: [
    { id: "local-takeover", name: "Local Takeover", desc: "Geo authority program across 3 markets", cadence: "Always-on", health: "strong", since: "Mar 2025", icon: "map" },
    { id: "gbp-optimization", name: "GBP Optimization", desc: "Google Business Profile management — 3 locations", cadence: "Weekly", health: "strong", since: "Mar 2025", icon: "pin" },
    { id: "ppc", name: "PPC Management", desc: "Google Ads · $4.2K/mo budget", cadence: "Daily", health: "watch", since: "Jun 2025", icon: "bolt" },
    { id: "seo-geo", name: "SEO + GEO", desc: "Technical SEO + AI search optimization", cadence: "Monthly", health: "strong", since: "Mar 2025", icon: "search" },
    { id: "content", name: "Content Engine", desc: "2 long-form pieces + 4 social per month", cadence: "Monthly", health: "strong", since: "Jul 2025", icon: "doc" },
    { id: "reviews", name: "Reputation", desc: "Review generation + response", cadence: "Always-on", health: "strong", since: "Apr 2025", icon: "star" },
  ],
  roles: [
    { id: "owner", label: "Owner" },
    { id: "bd", label: "BD" },
    { id: "ops", label: "Ops" },
  ],
  kpis: [
    { label: "Boards signed (12 mo)", value: "9", trend: "+3", up: true, icon: "trophy", tone: "pink" },
    { label: "Qualified opportunities", value: "412", trend: "+38%", up: true, icon: "phone", tone: "yellow" },
    { label: "Investment ratio", value: "7.3×", trend: "+1.4×", up: true, icon: "trend", tone: "purple" },
    { label: "Avg review rating", value: "4.8", trend: "+0.2", up: true, icon: "star", tone: "green" },
  ],
  // Recurring services — pulls from client config (static)
  recurringServices: [
    { id: "local-takeover", name: "Local Takeover", short: "LT", cadence: "Always-on", lane: "BoardReach", color: "pink", lastTouch: "Updated yesterday", note: "12 locations · top-3 in 8 markets" },
    { id: "gbp-opt", name: "GBP Optimization", short: "GBP", cadence: "Weekly", lane: "BoardReach", color: "yellow", lastTouch: "Posts published Mon", note: "3 listings · 2,840 monthly views" },
    { id: "ppc", name: "PPC Management", short: "PPC", cadence: "Daily monitoring", lane: "BoardMatch", color: "purple", lastTouch: "Optimized 6h ago", note: "$3.2K/mo · 4.1× ROAS" },
    { id: "seo-geo", name: "SEO / GEO", short: "SEO", cadence: "Monthly", lane: "BoardReach", color: "blue", lastTouch: "Report sent Mar 1", note: "Tracking 142 keywords" },
    { id: "review-gen", name: "Review Generation", short: "REV", cadence: "Always-on", lane: "BoardRetain", color: "green", lastTouch: "8 new reviews this week", note: "4.8★ avg · 312 total" },
  ],
  projects: [
    { id: "PR-218", title: "Geo landing pages — North Austin cluster", phase: "BoardReach", engines: ["reach"], pct: 72, status: "in-progress", due: "Apr 12", dueRel: "in 26 days", owners: ["JG","SN"], pulse: "Last update 2h ago" },
    { id: "PR-201", title: "Proposal redesign v2 — Premium kit", phase: "BoardMatch", engines: ["match"], pct: 88, status: "review", due: "Mar 21", dueRel: "needs your review", owners: ["CL"], pulse: "Awaiting your approval" },
    { id: "PR-194", title: "Outsmarting AI Search · micro-course", phase: "Energy", engines: ["reach","match","retain"], pct: 100, status: "live", due: "Mar 14", dueRel: "shipped", owners: ["JG","SN","CL"], pulse: "Live · 247 views" },
    { id: "PR-225", title: "Q1 board education program — Module 3", phase: "BoardRetain", engines: ["retain"], pct: 34, status: "in-progress", due: "Apr 28", dueRel: "in 6 wks", owners: ["SN","CL"], pulse: "Drafting outline" },
    { id: "PR-211", title: "GBP listings refresh — all 3 locations", phase: "BoardReach", engines: ["reach","retain"], pct: 18, status: "review", due: "Apr 4", dueRel: "awaiting your photos", owners: ["JG"], pulse: "Need photos from you" },
    { id: "PR-188", title: "RISE case study — Lakeway Villas signing", phase: "BoardReach", engines: ["reach","match"], pct: 100, status: "live", due: "Feb 22", dueRel: "shipped", owners: ["CL","SN"], pulse: "Live · 1.4K views" },
    { id: "PR-230", title: "Pillar page · HOA budgeting authority hub", phase: "BoardReach", engines: ["reach"], pct: 52, status: "in-progress", due: "May 9", dueRel: "in 8 wks", owners: ["JG","CL"], pulse: "Outline approved · drafting" },
    { id: "PR-232", title: "BD discovery script · v3 rollout", phase: "BoardMatch", engines: ["match"], pct: 28, status: "in-progress", due: "May 2", dueRel: "in 7 wks", owners: ["CL"], pulse: "First training session booked" },
    { id: "PR-235", title: "Round Rock geo cluster · 10 pages", phase: "BoardReach", engines: ["reach"], pct: 12, status: "planning", due: "May 24", dueRel: "in 10 wks", owners: ["JG","SN"], pulse: "Keyword brief in review" },
    { id: "PR-237", title: "Manager transition playbook · refresh", phase: "BoardRetain", engines: ["retain"], pct: 46, status: "in-progress", due: "Apr 30", dueRel: "in 6 wks", owners: ["SN"], pulse: "2 sections to go" },
    { id: "PR-240", title: "Quarterly proposal kit · digital v3", phase: "BoardMatch", engines: ["match","retain"], pct: 8, status: "assigned", due: "Jun 6", dueRel: "in 12 wks", owners: ["CL","JG"], pulse: "Discovery kickoff this week" },
    { id: "PR-242", title: "Westwind onboarding · web + GBP", phase: "BoardReach", engines: ["reach","retain"], pct: 64, status: "review", due: "Apr 21", dueRel: "awaiting your approval", owners: ["JG"], pulse: "Final copy ready for sign-off" },
    { id: "PR-244", title: "CAI Austin chapter · sponsorship assets", phase: "Energy", engines: ["reach","match"], pct: 22, status: "planning", due: "Apr 18", dueRel: "in 4 wks", owners: ["CL","SN"], pulse: "Booth design approved" },
  ],
  recentLeads: [
    { name: "Westwind HOA · Karen Maslo", source: "Google Ads · 'hoa management austin'", quality: "qualified", value: "$48K/yr", time: "12 min ago", type: "call" },
    { name: "Cedar Park Townhomes", source: "Organic · /services/board-management", quality: "hot", value: "$72K/yr", time: "1h ago", type: "form" },
    { name: "Riverstone Master Assoc.", source: "GBP · Round Rock listing", quality: "review", value: "$110K/yr", time: "3h ago", type: "call" },
    { name: "Brushy Creek Community", source: "Direct · referral form", quality: "qualified", value: "$58K/yr", time: "yesterday", type: "form" },
  ],
  activity: [
    { color: "pink", text: "Lakeway Villas signed — $54K/yr contract attributed to Alloy", meta: "Just now · BoardMatch · +1 badge unlocked", },
    { color: "yellow", text: "12 new qualified leads from your Google Ads campaign", meta: "1h ago · WhatConverts" },
    { color: "blue", text: "Justin sent the new proposal v2 for your review", meta: "3h ago · BoardMatch · 2 changes" },
    { color: "green", text: "Your Google review average climbed to 4.8★ (+0.2)", meta: "Yesterday · BoardRetain" },
    { color: "purple", text: "Q1 strategy session notes published", meta: "Mar 12 · 14 priorities tracked" },
  ],
  weeklySnapshot: {
    weekLabel: "Week of Mar 16 – 22",
    pdf: "reports/weekly-snapshot-mar-22.pdf",
    quarterlyHref: "roi",
    summary: { waiting: 3, leads: 4, leadsValue: "$288K/yr", completed: 2 },
    waiting: [
      { text: "Approve proposal redesign v2 — Premium kit", meta: "PR-201 · BoardMatch" },
      { text: "Send GBP listing photos — all 3 locations", meta: "PR-211 · BoardReach" },
      { text: "Qualify Riverstone Master Assoc.", meta: "$110K/yr · GBP Round Rock" },
    ],
    completed: [
      { text: "North Austin geo cluster — 8 pages live", meta: "PR-218 · shipped Thu" },
      { text: "Lakeway Villas case study published", meta: "PR-188 · 1.4K views" },
    ],
    upcoming: [
      { text: "Westwind onboarding — copy sign-off", meta: "Due Apr 21" },
      { text: "Board education · Module 3 kickoff", meta: "Drafting starts Mon" },
      { text: "Q1 strategy review call", meta: "Thu · 2:00 PM CT" },
    ],
    past: [
      { label: "Week of Mar 9 – 15", file: "reports/weekly-mar-15.pdf" },
      { label: "Week of Mar 2 – 8", file: "reports/weekly-mar-08.pdf" },
      { label: "Week of Feb 23 – Mar 1", file: "reports/weekly-mar-01.pdf" },
      { label: "Week of Feb 16 – 22", file: "reports/weekly-feb-22.pdf" },
    ],
  },
  tickets: [
    { id: "ZD-4218", title: "Update phone number on every site footer", priority: "med", status: "open", agent: "Cameron Lange", time: "12 min ago", excerpt: "Hi team — we just changed our main 800 number to 855-555-0144. Can you push it everywhere it shows on our site, including the GBP listings, footer, and contact page?" },
    { id: "ZD-4209", title: "Need a quick edit on the Westwind case study", priority: "low", status: "in-progress", agent: "Skyler Nelson", time: "2h ago", excerpt: "Board chair sent over a corrected quote — can we swap it on the case study page?" },
    { id: "ZD-4187", title: "Question on Q2 budget — adding board education?", priority: "high", status: "open", agent: "Justin Guenther", time: "Yesterday", excerpt: "Want to talk through whether we have point budget room to add a 4-module board education program in Q2." },
    { id: "ZD-4156", title: "Feedback on proposal v2 design", priority: "med", status: "answered", agent: "Cameron Lange", time: "3 days ago", excerpt: "Loved the new layout — one note on the cover page typography." },
    { id: "ZD-4144", title: "Send tradeshow assets for CAI Austin chapter", priority: "med", status: "answered", agent: "Justin Guenther", time: "Last week", excerpt: "Need the booth banner and table topper files by Friday for the printer." },
  ],
  roadmap: [
    { q: "Q1 2026", months: "Jan – Mar", title: "Foundation", state: "done", file: "playbooks/q1-2026-playbook.pdf", focuses: [
      { t: "Site audit + technical SEO", s: "complete" },
      { t: "GA4 + WhatConverts wired", s: "complete" },
      { t: "Sales messaging refresh", s: "complete" },
      { t: "Review generation campaign", s: "missed" },
      { t: "South Austin geo cluster (12 pages)", s: "missed" },
    ]},
    { q: "Q2 2026", months: "Apr – Jun", title: "Momentum", state: "now", file: "playbooks/q2-2026-playbook.pdf", focuses: [
      { t: "North Austin geo cluster", s: "complete" },
      { t: "GBP refresh — 3 locations", s: "complete" },
      { t: "Premium proposal kit v2", s: "complete" },
      { t: "Board education · Module 3", s: "pending" },
      { t: "Outsmarting AI Search course launch", s: "pending" },
    ]},
    { q: "Q3 2026", months: "Jul – Sep", title: "Scale", state: "next", file: "playbooks/q3-2026-playbook.pdf", focuses: [
      { t: "Pillar: HOA budgeting authority hub", s: "pending" },
      { t: "Round Rock geo cluster", s: "pending" },
      { t: "BD training · 2 sessions", s: "pending" },
      { t: "Onboarding system v1", s: "pending" },
      { t: "Annual review playbook", s: "pending" },
    ]},
    { q: "Q4 2026", months: "Oct – Dec", title: "Expansion", state: "future", file: "playbooks/q4-2026-playbook.pdf", focuses: [
      { t: "Certification track design", s: "pending" },
      { t: "Second metro market scoping", s: "pending" },
      { t: "RFP system templates", s: "pending" },
      { t: "Board retention review", s: "pending" },
      { t: "2027 roadmap planning", s: "pending" },
    ]},
  ],
  badges: [
    { id: "first-board", name: "First Board", desc: "Signed your first contract attributed to Alloy.", state: "earned", earned: "Earned May 2025", color: "pink", category: "milestone" },
    { id: "five-wins", name: "Five Wins", desc: "5 boards signed through the Alloy growth engine.", state: "earned", earned: "Earned Nov 2025", color: "pink", category: "milestone" },
    { id: "100k-pipeline", name: "$100K Pipeline", desc: "Crossed $100K in attributed contract value.", state: "earned", earned: "Earned Jul 2025", color: "yellow", category: "pipeline" },
    { id: "500k-pipeline", name: "Half-Mil Mark", desc: "Crossed $500K in lifetime attributed value.", state: "earned", earned: "Earned Feb 2026", color: "yellow", category: "pipeline" },
    { id: "review-streak", name: "Review Magnet", desc: "Maintained 4.5★+ average across 100+ reviews.", state: "earned", earned: "Earned Jan 2026", color: "green", category: "health" },
    { id: "engagement-30", name: "30-Day Streak", desc: "Logged into the portal 30 days running.", state: "earned", earned: "Earned today 🔥", color: "blue", category: "engagement" },
    { id: "authority-tier", name: "Authority Tier", desc: "Unlocked Authority status with 2+ published courses.", state: "earned", earned: "Earned Mar 2026", color: "purple", category: "tier" },
    { id: "ten-wins", name: "Ten Wins", desc: "10 boards signed — graduate to elite client status.", state: "progress", pct: 90, color: "pink", category: "milestone" },
    { id: "geo-titan", name: "Geo Titan", desc: "Top-3 ranking in 3 distinct geo markets.", state: "progress", pct: 60, color: "yellow", category: "visibility" },
    { id: "no-churn", name: "Zero Churn '26", desc: "Make it through the calendar year with no association loss.", state: "progress", pct: 22, color: "green", category: "health" },
    { id: "million-pipeline", name: "$1M Mark", desc: "Cross $1M in lifetime Alloy-attributed value.", state: "locked", color: "yellow", category: "pipeline" },
    { id: "ascend", name: "Ascend Tier", desc: "Graduate to the Ascend tier — multi-market expansion.", state: "locked", color: "purple", category: "tier" },
    { id: "founders-day", name: "Founders' Day", desc: "Spend a full strategy day with the Alloy partners in Austin.", state: "locked", color: "pink", category: "reward" },
  ],
  roi: {
    yearLabel: "Mar 2025 – Mar 2026",
    invested: 84000,
    contractValue: 612000,
    boardsSigned: 9,
    ratio: 7.3,
    rankingsTracked: 142,
    rankingsTop10: 47,
  },
  library: [
    { lane: "attract", stage: "BoardReach", ttl: "The CAM SEO Field Guide", meta: "Guide · 24 min read", desc: "Everything you need to outrank generalist competitors in your metro." },
    { lane: "attract", stage: "BoardReach", ttl: "Outsmarting AI Search", meta: "Course · 5 lessons · in progress", desc: "How micro-courses drive citations from Perplexity, Gemini & ChatGPT." },
    { lane: "close", stage: "BoardMatch", ttl: "Proposal Anatomy", meta: "Playbook · 14 sections", desc: "What separates a winning CAM proposal from a discarded PDF." },
    { lane: "close", stage: "BoardMatch", ttl: "Discovery Frameworks for BD", meta: "Training · 3 sessions", desc: "The conversation pattern that gets boards talking honestly." },
    { lane: "keep", stage: "BoardRetain", ttl: "Manager Transition Playbook", meta: "Guide · 16 min read", desc: "Save the association when your manager moves on." },
    { lane: "keep", stage: "BoardRetain", ttl: "Board Education · Governance 101", meta: "Course · 6 modules", desc: "Position your firm as the educator. Reduce churn from misunderstanding." },
    { lane: "energy", stage: "L&D", ttl: "Building a Staff Onboarding Engine", meta: "Toolkit · templates included", desc: "Cut time-to-productivity for new community managers in half." },
    { lane: "energy", stage: "L&D", ttl: "Gamification for CAM Staff", meta: "Strategy guide · 18 min read", desc: "How recognition systems lift retention without feeling corny." },
  ],
};

// Replace the mock contents in-place with live data (same object reference,
// so every component that imported DATA sees the new values). Used by the
// data loader once the signed-in user's account data has been fetched.
export function applyData(next) {
  for (const key of Object.keys(DATA)) delete DATA[key];
  Object.assign(DATA, next);
}
