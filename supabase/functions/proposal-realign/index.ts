import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// proposal-realign — Layer C of the editability track. Given a proposal's current
// state + a sales-call transcript, the LLM proposes a DIFF: factual updates the
// call revealed (homes, dues, timeline, budget, contact…) and NEW concerns the
// board raised that aren't already matched. The cockpit shows the diff for
// accept/reject — it never auto-applies. Apply writes through the same paths as
// hand-edits (Layer A facts + Layer B match).
//
// Pure transform: NO database reads/writes. Calls Anthropic only.
// Secret: ANTHROPIC_API_KEY. Model: PROPOSAL_MATCH_MODEL env override, else opus.
// verify_jwt: true (a signed-in CAM staffer triggers it).

const MODEL = (Deno.env.get("PROPOSAL_MATCH_MODEL") || "claude-opus-4-8").trim();

const FIELD_KEYS = ["community", "contact", "contactRole", "email", "phone", "city", "homes", "metaType", "metaStatus", "dues", "engageTimeline", "budget"];

const SYSTEM = `You update an HOA/condo-management sales PROPOSAL after a discovery call. You are given the proposal's current state (facts + the concerns already matched to the CAM's UVPs) and the call transcript. Produce a careful DIFF the salesperson will review before applying.

Return two lists:
1. fieldChanges — facts the call clearly changed. ONLY include a field if the transcript gives a new, specific value that differs from the current one. Use the exact field keys provided. "from" = the current value, "to" = the new value (both as short strings). Never guess; if the call didn't clearly change a fact, omit it.
2. addedConcerns — NEW concerns the board raised on the call that are NOT already in the current concern list. For each: label (the board's framing), caps (indices of the CAM UVPs that answer it, best first, ≤4, ONLY from the provided library), fit (0–100, calibrated), headline (≤12 words), body (2–3 grounded sentences), source ("narrative", since it came from the call). Do NOT restate concerns already present. If the call raised nothing new, return [].

Also a one-sentence summary of what the call changed. Be conservative and precise — this is a real sales document. When in doubt, leave it out.`;

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    fieldChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string", enum: FIELD_KEYS },
          label: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["field", "label", "from", "to"],
      },
    },
    addedConcerns: {
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
          source: { type: "string", enum: ["pain", "narrative"] },
        },
        required: ["label", "caps", "fit", "headline", "body", "source"],
      },
    },
  },
  required: ["summary", "fieldChanges", "addedConcerns"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const clampPct = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function buildUserContent(p: any, uvps: any[], transcript: string): string {
  const library = (uvps || []).map((u: any, i: number) => `[${i}] ${u.title} — ${u.blurb || u.short || ""}`).join("\n");
  const concerns = (p.concerns || []).map((c: any, i: number) => `${i + 1}. ${c.label}`).join("\n");
  return `CAM UVP LIBRARY (index — title — blurb):
${library}

CURRENT PROPOSAL FACTS:
- community: ${p.community || ""}
- contact: ${p.contact || ""}
- contactRole: ${p.contactRole || ""}
- email: ${p.email || ""}
- phone: ${p.phone || ""}
- city: ${p.city || ""}
- homes: ${p.homes ?? ""}
- metaType: ${p.metaType || ""}
- metaStatus: ${p.metaStatus || ""}
- dues: ${p.dues || ""}
- engageTimeline: ${p.engageTimeline || ""}
- budget: ${p.budget || ""}

CONCERNS ALREADY IN THE PROPOSAL:
${concerns || "(none)"}

CALL TRANSCRIPT:
"""
${(transcript || "").slice(0, 24000)}
"""

Produce the diff per your instructions. Return only the structured object.`;
}

function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ } }
  return null;
}

function normalize(raw: any, uvps: any[]) {
  const n = (uvps || []).length;
  const fieldChanges = (Array.isArray(raw?.fieldChanges) ? raw.fieldChanges : [])
    .filter((f: any) => FIELD_KEYS.includes(f?.field) && String(f?.to ?? "").trim() !== "")
    .map((f: any) => ({ field: f.field, label: String(f.label || f.field), from: String(f.from ?? ""), to: String(f.to ?? "") }));
  const addedConcerns = (Array.isArray(raw?.addedConcerns) ? raw.addedConcerns : [])
    .map((c: any) => {
      const caps = (Array.isArray(c.caps) ? c.caps : []).map((i: any) => Number(i)).filter((i: number) => Number.isInteger(i) && i >= 0 && i < n).slice(0, 4);
      return { label: String(c.label || "").trim(), fit: clampPct(c.fit), caps, headline: String(c.headline || "").trim(), body: String(c.body || "").trim(), proof: "", metric: null, source: "narrative" };
    })
    .filter((c: any) => c.label);
  return { summary: String(raw?.summary || "").trim(), fieldChanges, addedConcerns };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!key) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const { proposal, uvps, transcript } = body || {};
    if (!proposal || !Array.isArray(uvps) || !uvps.length || !transcript || !String(transcript).trim()) {
      return json({ error: "proposal + uvps + transcript are required" }, 400);
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: MATCH_SCHEMA } },
        messages: [{ role: "user", content: buildUserContent(proposal, uvps, transcript) }],
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
