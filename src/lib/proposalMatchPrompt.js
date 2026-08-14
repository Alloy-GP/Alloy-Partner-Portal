// ============================================================================
// LLM matching — shared prompt + output schema + normalizer.
//
// The "smart" layer over the deterministic tag engine: instead of tag overlap,
// an LLM reads the board's actual words (selected pains + free-text narrative)
// and maps them to THIS client's unique UVP library with semantic judgment —
// calibrating a fit %, picking the strongest strengths, and drafting the
// per-concern prose. This is what makes free-text / open-ended pain points work
// (decision 3b), which tag matching can't do.
//
// Pure JS (no Deno/Node/React specifics) so it's the single source of truth for
// BOTH the browser caller (src/lib/proposalLLM.js) and the
// Deno edge function (supabase/functions/proposal-match) — the edge fn mirrors
// SYSTEM/MATCH_SCHEMA verbatim; keep them in sync.
//
// Safety: the model returns UVP *indices* into the client's library; we validate
// every index server-side and drop hallucinated ones — the LLM can never invent
// a strength the client doesn't actually have.
// ============================================================================

export const MATCH_MODEL_DEFAULT = "claude-opus-4-8";

export const SYSTEM = `You match an HOA/condo board's stated concerns to a community-association-management (CAM) company's unique value propositions (UVPs), for a tailored sales proposal.

You are given:
- The CAM's UVP library — each with an index, title, and one-line capability blurb. These are the ONLY strengths the CAM actually has.
- The board's concerns: a list of selected pain points, plus the board's own narrative in their words.

For each distinct concern the board raised (from the selected pains AND anything material in their narrative), produce:
- label: the concern in plain language (lift the board's framing where you can).
- caps: the indices of the UVPs that genuinely answer this concern, best first, at most 4. Use ONLY indices from the provided library. If nothing fits, return [].
- fit: 0–100, how completely the CAM's strengths answer THIS concern. Be honest and calibrated — reserve 90+ for concerns a top strength squarely resolves; use 60–80 when the match is partial or indirect; do not inflate. Not every concern is a 100.
- headline: one punchy sentence (≤ 12 words) the board will read as the answer to this concern.
- body: 2–3 sentences, warm and concrete, grounded in the board's actual words and the matched UVP(s). No fluff, no clichés.
- proof + metricValue: a short proof label and its value pulled from the matched UVP blurb (e.g. "97%" / "Call timeliness"). Leave metricValue "" if none is implied.
- source: "narrative" if you surfaced this concern primarily from the board's free-text narrative (something they wrote that is NOT one of their selected pain-point checkboxes); otherwise "pain". Be honest — only mark "narrative" when the free-text genuinely added a concern the checkboxes didn't already cover.

Also return an overall match (0–100): your holistic read of how well this CAM fits this board, weighing the concern fits and their importance.

Rules:
- Map only to real UVP indices. Never invent a capability.
- Prefer fewer, stronger matches over padding caps.
- Keep prose tight and specific; avoid generic management-speak.`;

// Anthropic structured-output schema. Note the API's json_schema constraints:
// no numeric min/max, no string length limits, additionalProperties:false on
// every object. We clamp/validate ranges in normalizeLLMMatch instead.
export const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    match: { type: "integer", description: "Overall fit 0-100" },
    concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          caps: { type: "array", items: { type: "integer" } },
          fit: { type: "integer" },
          headline: { type: "string" },
          body: { type: "string" },
          proof: { type: "string" },
          metricValue: { type: "string" },
          source: { type: "string", enum: ["pain", "narrative"] },
        },
        required: ["label", "caps", "fit", "headline", "body", "proof", "metricValue", "source"],
      },
    },
  },
  required: ["match", "concerns"],
};

// Build the user message content for one lead.
export function buildUserContent(lead, { uvps, painPoints }) {
  const painById = new Map((painPoints || []).map((p) => [p.id, p]));
  const selected = (lead.selectedPains || [])
    .map((id) => painById.get(id))
    .filter(Boolean)
    .map((p) => `- ${p.label}`)
    .join("\n");

  const library = (uvps || [])
    .map((u, i) => `[${i}] ${u.title} — ${u.blurb || u.short || ""}`)
    .join("\n");

  return `CAM UVP LIBRARY (index — title — blurb):
${library}

COMMUNITY: ${lead.community} · ${lead.city} · ${lead.homes} homes · ${lead.metaType || ""}
CURRENT SITUATION: ${lead.metaStatus || ""}; ${lead.engageTimeline || ""}; budget: ${lead.budget || ""}

BOARD'S SELECTED CONCERNS:
${selected || "(none selected)"}

BOARD'S NARRATIVE (their own words):
"${lead.quote || ""}"

Match their concerns to the UVP library per your instructions. Return only the structured object.`;
}

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Validate + shape the model's raw JSON into the design's lead-match shape.
// Drops out-of-range UVP indices (no hallucinated strengths), clamps fits,
// and derives scores[]/links[] the same way the deterministic engine does.
export function normalizeLLMMatch(raw, { uvps }) {
  const n = (uvps || []).length;
  const concernsRaw = Array.isArray(raw?.concerns) ? raw.concerns : [];

  const concerns = concernsRaw.map((c) => {
    const caps = (Array.isArray(c.caps) ? c.caps : [])
      .map((i) => Number(i))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
      .slice(0, 4);
    return {
      label: String(c.label || "").trim(),
      fit: clampPct(c.fit),
      caps,
      headline: String(c.headline || "").trim(),
      body: String(c.body || "").trim(),
      proof: String(c.proof || "").trim(),
      metric: c.metricValue ? { value: String(c.metricValue), label: String(c.proof || "") } : null,
      source: c.source === "narrative" ? "narrative" : "pain",
    };
  }).filter((c) => c.label);

  // per-UVP relevance = number of concerns whose caps include this UVP
  const scores = (uvps || []).map((_, i) => concerns.filter((c) => c.caps.includes(i)).length);
  const overall = raw?.match != null
    ? clampPct(raw.match)
    : (concerns.length ? Math.round(concerns.reduce((a, c) => a + c.fit, 0) / concerns.length) : 0);

  return {
    match: overall,
    concerns,
    scores,
    links: concerns.map((c) => c.caps),
    capsMatched: scores.filter((s) => s > 0).length,
    capsTotal: n,
    _source: "llm",
  };
}
