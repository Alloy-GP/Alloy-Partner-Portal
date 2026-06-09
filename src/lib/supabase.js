import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when both env vars are present. When false, the app runs in
// "mock mode" (no auth gate) so local dev and the current Vercel deploy keep
// working on src/data.js until the Supabase project is wired up.
export const isSupabaseConfigured = Boolean(url && anonKey);

// Single shared client. detectSessionInUrl lets Supabase pick up the magic
// link token from the URL hash on the redirect back from the email.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
