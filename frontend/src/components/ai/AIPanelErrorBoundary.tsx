import React from 'react';

interface AIPanelErrorBoundaryProps {
  children: React.ReactNode;
  fallback: (error: Error | null) => React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface AIPanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AIPanelErrorBoundary extends React.Component<
  AIPanelErrorBoundaryProps,
  AIPanelErrorBoundaryState
> {
  constructor(props: AIPanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AIPanelErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error);
    }

    return this.props.children;
  }
}

export default AIPanelErrorBoundary;
