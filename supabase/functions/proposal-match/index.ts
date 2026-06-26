import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// proposal-match — the "smart" LLM matcher for the proposal system.
//
// Takes a lead (selected pains + free-text narrative + community context) and a
// CAM's UVP library, asks Claude to map the board's concerns to the CAM's real
// strengths with a calibrated fit % + tailored prose, and returns the same shape
// the deterministic engine produces (src/lib/proposalMatch.js → deriveLeadMatch),
// so the Review UI is matcher-agnostic. The deterministic engine is the caller's
// fallback when this errors.
//
// Pure transform: NO database reads or writes. Calls Anthropic only.
// Secret: ANTHROPIC_API_KEY (already provisioned for summarize-tickets).
// Model: PROPOSAL_MATCH_MODEL env override, else claude-opus-4-8.
// verify_jwt: true (client-facing — a signed-in CAM staffer triggers it).
//
// SYSTEM + SCHEMA mirror src/lib/proposalMatchPrompt.js — keep them in sync.

const MODEL = (Deno.env.get("PROPOSAL_MATCH_MODEL") || "claude-opus-4-8").trim();

const SYSTEM = `You match an HOA/condo board's stated concerns to a community-association-management (CAM) company's unique value propositions (UVPs), for a tailored sales proposal.

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

Also return an overall match (0–100): your holistic read of how well this CAM fits this board, weighing the concern fits and their importance.

Rules:
- Map only to real UVP indices. Never invent a capability.
- Prefer fewer, stronger matches over padding caps.
- Keep prose tight and specific; avoid generic management-speak.`;

const MATCH_SCHEMA = {
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
        },
        required: ["label", "caps", "fit", "headline", "body", "proof", "metricValue"],
      },
    },
  },
  required: ["match", "concerns"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const clampPct = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function buildUserContent(lead: any, uvps: any[], painPoints: any[]): string {
  const painById = new Map((painPoints || []).map((p: any) => [p.id, p]));
  const selected = (lead.selectedPains || [])
    .map((id: string) => painById.get(id))
    .filter(Boolean)
    .map((p: any) => `- ${p.label}`)
    .join("\n");
  const library = (uvps || [])
    .map((u: any, i: number) => `[${i}] ${u.title} — ${u.blurb || u.short || ""}`)
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

// Pull the JSON object out of the model response, tolerant of stray prose.
function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ }
  }
  return null;
}

function normalize(raw: any, uvps: any[]) {
  const n = (uvps || []).length;
  const concernsRaw = Array.isArray(raw?.concerns) ? raw.concerns : [];
  const concerns = concernsRaw.map((c: any) => {
    const caps = (Array.isArray(c.caps) ? c.caps : [])
      .map((i: any) => Number(i))
      .filter((i: number) => Number.isInteger(i) && i >= 0 && i < n)
      .slice(0, 4);
    return {
      label: String(c.label || "").trim(),
      fit: clampPct(c.fit),
      caps,
      headline: String(c.headline || "").trim(),
      body: String(c.body || "").trim(),
      proof: String(c.proof || "").trim(),
      metric: c.metricValue ? { value: String(c.metricValue), label: String(c.proof || "") } : null,
    };
  }).filter((c: any) => c.label);
  const scores = (uvps || []).map((_: any, i: number) => concerns.filter((c: any) => c.caps.includes(i)).length);
  const overall = raw?.match != null
    ? clampPct(raw.match)
    : (concerns.length ? Math.round(concerns.reduce((a: number, c: any) => a + c.fit, 0) / concerns.length) : 0);
  return {
    match: overall,
    concerns,
    scores,
    links: concerns.map((c: any) => c.caps),
    capsMatched: scores.filter((s: number) => s > 0).length,
    capsTotal: n,
    _source: "llm",
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!key) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const { lead, uvps, painPoints } = body || {};
    if (!lead || !Array.isArray(uvps) || !uvps.length) {
      return json({ error: "lead + uvps are required" }, 400);
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: MATCH_SCHEMA } },
        messages: [{ role: "user", content: buildUserContent(lead, uvps, painPoints || []) }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: "anthropic_error", status: resp.status, detail: detail.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const raw = extractJSON(text);
    if (!raw) return json({ error: "unparseable_model_output", text: text.slice(0, 500) }, 502);

    return json({ ...normalize(raw, uvps), model: MODEL });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
