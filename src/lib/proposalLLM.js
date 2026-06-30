// ============================================================================
// Runtime LLM matcher (client side).
//
// Calls the proposal-match edge function for a live, LLM-computed match, and
// returns the same shape as the deterministic engine (deriveLeadMatch). Callers
// should fall back to the deterministic engine on throw, so the cockpit always
// renders even if the LLM is unavailable.
//
// This is the PRODUCTION-phase path (real leads, Supabase configured). The
// mock-data demo renders pre-baked results from proposalLLMMatches.generated.js
// instead — see scripts/llm-precompute-matches.mjs — so it needs no backend.
//
// Gated by VITE_PROPOSAL_LLM so it's inert until explicitly enabled.
// ============================================================================

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const LLM_ENABLED = String(import.meta.env?.VITE_PROPOSAL_LLM || "") === "1";

export async function matchLeadWithLLM(lead, { uvps, painPoints }) {
  if (!LLM_ENABLED) throw new Error("LLM matching disabled (set VITE_PROPOSAL_LLM=1)");
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Supabase env not configured");

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-match`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ lead, uvps, painPoints }),
  });
  if (!resp.ok) throw new Error(`proposal-match ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error);
  return data; // { match, concerns, scores, links, capsMatched, capsTotal, _source:'llm', model }
}

// Layer C — realign a proposal from a sales-call transcript. Returns a reviewable
// diff: { summary, fieldChanges:[{field,label,from,to}], addedConcerns:[concern], model }.
export async function realignFromTranscript(proposal, { uvps, transcript }) {
  if (!LLM_ENABLED) throw new Error("LLM matching disabled (set VITE_PROPOSAL_LLM=1)");
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Supabase env not configured");
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-realign`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ proposal, uvps, transcript }),
  });
  if (!resp.ok) throw new Error(`proposal-realign ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error);
  return data;
}
