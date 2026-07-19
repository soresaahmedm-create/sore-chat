import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Sore Chat crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', textAlign: 'center', padding: 24,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 420, marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
            {this.state.error.message || String(this.state.error)}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--signal)',
              color: 'var(--bg)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
