import React from 'react';

// Catches render errors in a screen (e.g. a brand-new client with missing
// data) and shows a friendly fallback instead of a white screen. Give it a
// `key` that changes per screen so navigating resets it.
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
