'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logClientError } from '@/lib/clientErrorLogging';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] component crash:', error, errorInfo);
    logClientError({ error, errorInfo, source: 'component-error-boundary' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8" dir="rtl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <div className="text-center">
          <h3 className="mb-1 text-base font-bold" style={{ color: 'var(--theme-text)' }}>
            משהו השתבש
          </h3>
          <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
            אירעה שגיאה בטעינת הרכיב
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--theme-accent-glow)] px-4 py-2 text-sm font-medium text-[var(--theme-accent)] transition-opacity hover:opacity-80"
        >
          <RefreshCw className="h-4 w-4" />
          טען מחדש
        </button>
      </div>
    );
  }
}
