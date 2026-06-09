import React from 'react';
import { useAuth } from './lib/useAuth.js';
import Login from './components/Login.jsx';
import App from './App.jsx';

/**
 * Decides what to render based on auth state:
 *   - Supabase not configured → App directly (mock mode, no gate).
 *   - Loading the initial session → a minimal splash.
 *   - Configured + no session → the magic-link Login screen.
 *   - Configured + session → App, with session + sign-out wired in.
 */
function AuthGate() {
  const { configured, loading, session, signOut } = useAuth();

  if (!configured) return <App />;

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-bg" aria-hidden="true" />
      </div>
    );
  }

  if (!session) return <Login />;

  return <App session={session} onSignOut={signOut} />;
}

export default AuthGate;
