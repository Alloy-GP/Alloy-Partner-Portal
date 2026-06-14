import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';

// Fetch live Performance-page data from the `analytics` edge function for the
// viewed account, over the given trend window (30d | 90d | 12mo | All).
// Returns the normalized payload, or null in mock mode / on error (the page
// then shows its not-connected state). Each section may be null when its
// source isn't configured yet — the page omits it rather than faking it.
export async function fetchPerformance(accountId, range = '12mo') {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke('analytics', {
      body: { accountId: accountId || DATA.account?.id, range },
    });
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}
