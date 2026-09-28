import React from 'react';
import { clientLogger } from '../services/clientLogger.js';

// Keep one malformed room from taking down the rest of the chat surface.
export default class ConversationErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    clientLogger.error(`${this.props.scope || 'conversation'}_render_failed`, {
      error,
      componentStack: info?.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div role="alert" style={{ padding: 16, color: '#7f1d1d', textAlign: 'center' }}>
        <span>Conversation data could not be displayed.</span>
        <button type="button" onClick={this.handleRetry} style={{ marginLeft: 8 }}>
          Retry
        </button>
      </div>
    );
  }
}
