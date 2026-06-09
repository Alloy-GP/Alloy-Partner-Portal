import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Auth state for the app shell.
 *
 * Returns:
 *   configured  Whether Supabase env vars are set. When false the app runs
 *               un-gated (mock mode) — see src/lib/supabase.js.
 *   loading     True until the initial session lookup resolves.
 *   session     The Supabase session, or null when signed out.
 *   signOut()   Ends the session.
 */
export function useAuth() {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  };

  return { configured: isSupabaseConfigured, loading, session, signOut };
}
