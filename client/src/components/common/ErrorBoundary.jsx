import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="wrap py-32 text-center">
        <h1 className="text-[length:var(--text-h2)]">Something went wrong</h1>
        <p className="mt-3 text-muted">An unexpected error occurred. Reloading usually fixes it.</p>
        <button className="btn btn-solid mt-8" onClick={() => window.location.reload()}>Reload page</button>
      </div>
    );
  }
}
