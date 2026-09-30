import { supabase, isSupabaseConfigured } from './supabase.js';

// Client-side calls for the engagement proposal (the gate page). Both go
// through the `engagement-proposal` edge function so the acceptance record is
// written server-side and Alloy is emailed. Surfaces OUR error message on a
// non-2xx (the supabase client hides the body behind error.context).
async function invoke(body) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  // Every email the function sends links back to THIS portal host (staging vs
  // production) — same idea as the invite flow's redirectTo.
  const portalUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { data, error } = await supabase.functions.invoke('engagement-proposal', { body: { ...body, portalUrl } });
  if (error) {
    let msg = error.message || 'Service unavailable';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

// Owner accepts → { proposal } (the updated row).
export function acceptProposal({ proposalId, name, title, agreementVersion }) {
  return invoke({ action: 'accept', proposalId, name, title: title || '', agreementVersion });
}

// Any client user on the account asks a question / requests a change → { ok }.
export function requestProposalChanges({ proposalId, message }) {
  return invoke({ action: 'request_changes', proposalId, message });
}

// Staff: email the client's owner(s) that their proposal is ready → { sent }.
export function notifyProposalSent(proposalId) {
  return invoke({ action: 'notify_sent', proposalId });
}
