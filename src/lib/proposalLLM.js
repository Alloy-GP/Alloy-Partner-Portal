// ============================================================================
// Runtime LLM matcher (client side).
//
// Calls the proposal-match edge function for a live, LLM-computed match, and
// returns the same shape as the deterministic engine (deriveLeadMatch). Callers
// should fall back to the deterministic engine on throw, so the cockpit always
// renders even if the LLM is unavailable.
//
// This is the only LLM path: every lead is real, so a match is either computed
// here at intake (and persisted as proposals.match_snapshot) or falls back to the
// deterministic engine. Nothing is pre-baked.
//
// Gated by VITE_PROPOSAL_LLM so it's inert until explicitly enabled.
// ============================================================================

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
// LLM matching + transcript realign are core to the live proposal system, and
// they only run against our edge functions — which require Supabase anyway. So
// enable whenever the app is wired to Supabase (local, staging, prod), instead
// of depending on a build-time flag that has to be mirrored into every deploy.
// Opt OUT with VITE_PROPOSAL_LLM=0 (forces the deterministic engine). Without
// Supabase there are no leads to match at all.
export const LLM_ENABLED = !!SUPABASE_URL && !!ANON_KEY && String(import.meta.env?.VITE_PROPOSAL_LLM || "") !== "0";

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
