import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';

// ── Error boundary to catch render errors ────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui', color: '#dc2626', maxWidth: 600, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>App-Fehler</h1>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 12, borderRadius: 8 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
