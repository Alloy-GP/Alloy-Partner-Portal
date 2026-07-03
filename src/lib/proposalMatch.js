// ============================================================================
// Proposal matching engine — pain points → CAM UVPs, with match %.
//
// This is the core IP of the proposal system: a board flags the concerns
// keeping them up at night (pain points), and we surface the CAM's value
// props (UVPs) that answer those concerns, ranked, with an honest match %.
//
// Pure + design-agnostic on purpose. No React, no DB, no styling. Takes the
// board's selected pain-point ids + the UVP/pain taxonomy, returns a structured
// match result the UI renders however it likes. Ported from the handoff
// prototype's `matchUVPs` (design_reference/data.jsx) and extended with the
// match-% layer.
//
// Matching is tag-overlap based: every pain point and every UVP carries a set
// of `tags`; a UVP "answers" a pain when their tag sets intersect.
//
// Three honest, bounded-[0,100], board-explainable percentages:
//   · UVP concern-coverage % — of the board's N concerns, how many this one
//     strength speaks to. (|concerns this UVP touches| / |all concerns|)
//   · pain↔UVP pair strength % — of what defines a single concern, how much a
//     given UVP addresses. (|shared tags| / |that pain's tags|) Used to label
//     "this concern → best-matched strength, 80% match".
//   · proposal coverage % — of the board's concerns, how many are answered by
//     at least one surfaced UVP. The headline number for the cockpit.
// ============================================================================

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

// Faithful port of the prototype engine: score each UVP by how many of its tags
// overlap the union of the selected pains' tags, sorted strongest-first. The
// extra fields (matchedConcerns, coveragePct) are the match-% layer.
export function matchUVPs(selectedPainIds, painPoints, uvps) {
  const ids = new Set(selectedPainIds || []);
  const selectedPains = (painPoints || []).filter((p) => ids.has(p.id));
  const painTagSet = new Set(selectedPains.flatMap((p) => p.tags || []));
  const totalConcerns = selectedPains.length;

  const scored = (uvps || []).map((uvp) => {
    const uvpTags = uvp.tags || [];
    const matchingTags = uvpTags.filter((t) => painTagSet.has(t));
    // The board's concerns this UVP actually speaks to (≥1 shared tag).
    const matchedConcerns = selectedPains.filter((p) =>
      (p.tags || []).some((t) => uvpTags.includes(t))
    );
    return {
      ...uvp,
      score: matchingTags.length, // raw tag-overlap, as in the prototype
      matchingTags,
      matchedConcerns, // [{ id, label, tags }]
      coveragePct: pct(matchedConcerns.length, totalConcerns),
    };
  });

  // Strongest match first; stable tiebreak on sort_order/title so the order is
  // deterministic (important once this drives a snapshot).
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.title).localeCompare(String(b.title))
  );
  return scored;
}

// For each concern the board flagged, the UVPs that answer it, ranked by how
// completely they cover that concern's tags. The top one + its % is what the
// proposal shows beside the concern ("Volunteer burnout → backed by a pod · 80% match").
export function matchPainsToUVPs(selectedPainIds, painPoints, uvps) {
  const ids = new Set(selectedPainIds || []);
  const selectedPains = (painPoints || []).filter((p) => ids.has(p.id));

  return selectedPains.map((pain) => {
    const painTags = pain.tags || [];
    const ranked = (uvps || [])
      .map((uvp) => {
        const shared = (uvp.tags || []).filter((t) => painTags.includes(t));
        return { uvp, sharedTags: shared, matchPct: pct(shared.length, painTags.length) };
      })
      .filter((r) => r.sharedTags.length > 0)
      .sort((a, b) => b.matchPct - a.matchPct || b.sharedTags.length - a.sharedTags.length);

    return {
      pain, // { id, label, tags }
      rankedUvps: ranked, // [{ uvp, sharedTags, matchPct }]
      bestUvp: ranked[0]?.uvp || null,
      bestMatchPct: ranked[0]?.matchPct || 0,
      answered: ranked.length > 0,
    };
  });
}

// Adapter → the shape the v2 Review UI renders (sub.match / concerns[] with
// fit+caps / scores[] / links[]). The engine computes the BASELINE automatically
// from the board's intake pains + this client's UVP taxonomy; an LLM layer can
// later refine fit and rewrite the per-concern prose without changing this shape.
//
//   match   — overall % (mean of per-concern fit)
//   concerns[] — { label, fit, caps:[uvpIdx], headline, body, proof, metric }
//   scores[]   — per-UVP relevance (# of the board's concerns it answers)
//   links[]    — concern → [uvpIdx]  (drives the bipartite engine graph)
export function deriveLeadMatch(selectedPainIds, painPoints, uvps, { prose = {}, topCaps = 4 } = {}) {
  const ids = new Set(selectedPainIds || []);
  const selectedPains = (painPoints || []).filter((p) => ids.has(p.id));

  // per-UVP relevance = how many of the board's concerns this UVP speaks to
  const scores = (uvps || []).map((u) =>
    selectedPains.filter((p) => (p.tags || []).some((t) => (u.tags || []).includes(t))).length
  );

  const concerns = selectedPains.map((pain) => {
    const painTags = pain.tags || [];
    const ranked = (uvps || [])
      .map((u, i) => ({ i, shared: (u.tags || []).filter((t) => painTags.includes(t)) }))
      .filter((r) => r.shared.length > 0)
      .sort((a, b) => b.shared.length - a.shared.length);
    const caps = ranked.slice(0, topCaps).map((r) => r.i);
    // fit = how completely the single STRONGEST strength covers this concern's
    // tags. (Best-UVP, not union-of-all-UVPs: the library collectively covers
    // almost everything, so union-coverage pins every concern at 100% and the
    // strong/partial signal dies. Best-UVP gives an honest, calibrated spread —
    // a concern no single strength squarely answers reads as a partial match.)
    const fit = ranked.length ? pct(ranked[0].shared.length, painTags.length) : 0;
    const pr = prose[pain.id] || {};
    return {
      label: pain.label,
      fit,
      caps,
      headline: pr.headline || pain.label.split("—")[0].trim() + ", handled.",
      body: pr.body || "",
      proof: pr.metric ? pr.metric.label : "",
      metric: pr.metric || null,
    };
  });

  return {
    match: concerns.length ? Math.round(concerns.reduce((a, c) => a + c.fit, 0) / concerns.length) : 0,
    concerns,
    scores,
    links: concerns.map((c) => c.caps),
    capsMatched: scores.filter((s) => s > 0).length,
    capsTotal: (uvps || []).length,
  };
}

// One call that returns everything the cockpit/proposal needs. `topN` is how
// many UVPs surface as "matched" (handoff default: 7).
export function runMatch(selectedPainIds, painPoints, uvps, { topN = 7 } = {}) {
  const scoredUvps = matchUVPs(selectedPainIds, painPoints, uvps);
  const painMap = matchPainsToUVPs(selectedPainIds, painPoints, uvps);

  const total = painMap.length;
  const covered = painMap.filter((p) => p.answered).length;

  return {
    uvps: scoredUvps, // all UVPs, scored + sorted
    topUvps: scoredUvps.filter((u) => u.score > 0).slice(0, topN), // surfaced matches
    painMap, // per-concern → best UVP + match %
    coverage: { covered, total, pct: pct(covered, total) }, // headline number
  };
}
