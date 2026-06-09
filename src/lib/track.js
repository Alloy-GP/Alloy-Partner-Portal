import { supabase, isSupabaseConfigured } from './supabase.js';

// Fire-and-forget activity logging. account_id + user_id are stamped by DB
// defaults (current_account_id() / auth.uid()), so we only send type + meta.
// Powers admin analytics now; the same events feed gamification + LMS later.
export function track(type, meta = {}) {
  if (!isSupabaseConfigured) return;
  try {
    supabase.from('events').insert({ type, meta }).then(
      () => {}, () => {}, // ignore success/failure — never block the UI
    );
  } catch { /* ignore */ }
}
