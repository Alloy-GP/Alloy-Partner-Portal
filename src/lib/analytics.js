import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';

// Fetch live Performance-page data from the `analytics` edge function for the
// viewed account. Returns the normalized payload, or null in mock mode / on
// error (the page then shows sample data). Each section may be null when its
// source isn't configured yet — the page falls back per-section.
export async function fetchPerformance(accountId) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke('analytics', {
      body: { accountId: accountId || DATA.account?.id },
    });
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}
