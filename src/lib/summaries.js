import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';

// Thin wrapper over the `summarize-tickets` edge function. Given a list of
// Zendesk ticket ids (the "Waiting on you" cards), returns { id: summary } —
// one-line AI summaries of what the client needs. The function is cached
// (ticket_summaries table) and only re-calls the model when a ticket updates,
// so this is cheap to call on every Projects visit. Account-scoped: clients
// only their own org, staff any. Returns {} in mock mode or on error (the UI
// just shows no summary — never blocks the page).
export async function summarizeTickets(ids) {
  if (!isSupabaseConfigured) return {};
  const list = (ids || []).map(String).filter(Boolean);
  if (!list.length) return {};
  try {
    const { data, error } = await supabase.functions.invoke('summarize-tickets', {
      body: { accountId: DATA.account?.id, ids: list },
    });
    if (error) throw error;
    return (data && data.summaries) || {};
  } catch {
    return {};
  }
}
