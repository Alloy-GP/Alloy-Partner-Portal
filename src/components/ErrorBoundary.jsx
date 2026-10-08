import React from 'react';

// Catches render errors in a screen (e.g. a brand-new client with missing
// data) and shows a friendly fallback instead of a white screen. Give it a
// `key` that changes per screen so navigating resets it. With `root`, it wraps
// the whole app (main.jsx) and shows the error text + a Reload button — an
// undefined-identifier crash in App.jsx used to be a blank page (Insight,
// 2026-10-08).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[screen error]', error, info);
  }

  render() {
    if (this.state.error && this.props.root) {
      // Root variant (main.jsx): nothing above this can render the shell, so
      // say what broke and offer a reload — the one thing that always works.
      const msg = String((this.state.error && this.state.error.message) || this.state.error || 'Unknown error');
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Poppins, Helvetica, Arial, sans-serif', background: '#f6f3fa' }}>
          <div style={{ maxWidth: 520, background: '#fff', borderRadius: 16, padding: '26px 28px', boxShadow: '0 12px 40px rgba(26,15,38,0.12)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#381c4f' }}>Something went wrong loading the portal</div>
            <div style={{ fontSize: 13.5, color: '#5b5366', marginTop: 8, lineHeight: 1.5 }}>Reloading usually fixes it. If it keeps happening, send Alloy the line below.</div>
            <code style={{ display: 'block', marginTop: 12, padding: '8px 10px', borderRadius: 8, background: '#f3eef9', color: '#b4232a', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</code>
            <button type="button" onClick={() => window.location.reload()}
              style={{ marginTop: 16, background: '#d9356e', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Reload</button>
          </div>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div className="content" style={{ padding: '40px 22px' }}>
          <div className="card card-pad" style={{ maxWidth: 540 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--alloy-purple)' }}>
              Nothing to show here yet
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 6, lineHeight: 1.5 }}>
              This view ran into missing data — usually a client that hasn’t been set up yet.
              Add their details and integrations in <strong>Admin</strong>, then come back.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
