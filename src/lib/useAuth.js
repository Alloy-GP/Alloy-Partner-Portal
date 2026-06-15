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

    // supabase-js fires TOKEN_REFRESHED / SIGNED_IN on tab focus-recovery and on
    // its periodic token refresh. Each fires with a NEW session object; replacing
    // our state every time re-runs the gate's getMe/loadAccountData effects (keyed
    // on session), which flashes the splash and re-fetches the whole app on every
    // tab return. The client refreshes its own JWT internally, and we only read
    // session.user.{id,email} downstream — both stable across a refresh — so keep
    // the same object while the signed-in user is unchanged; only swap on a real
    // sign-in / sign-out / account switch.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession((prev) => (prev?.user?.id === next?.user?.id ? prev : next));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  };

  return { configured: isSupabaseConfigured, loading, session, signOut };
}
