'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-base mb-1" style={{ color: 'var(--theme-text)' }}>משהו השתבש</h3>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>אירעה שגיאה בטעינת הרכיב</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] hover:opacity-80 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
