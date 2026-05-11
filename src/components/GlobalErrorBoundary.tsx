'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logClientError } from '@/lib/clientErrorLogging';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export default class GlobalErrorBoundary extends Component<Props, State> {
  private handleWindowError = (event: ErrorEvent) => {
    logClientError({ error: event.error || event.message, source: 'window-error' });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    logClientError({ error: event.reason, source: 'unhandled-rejection' });
  };

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalErrorBoundary] client crash:', error, errorInfo);
    logClientError({ error, errorInfo, source: 'global-error-boundary' });
  }

  componentDidMount() {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        dir="rtl"
        style={{ background: 'var(--theme-bg, #030712)', color: 'var(--theme-text, #f3f4f6)' }}
      >
        <div className="w-full max-w-md rounded-2xl border p-6 text-center shadow-2xl" style={{ background: 'var(--theme-bg-secondary, #111827)', borderColor: 'var(--theme-border, rgba(255,255,255,0.12))' }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="mb-2 text-xl font-black">משהו השתבש</h1>
          <p className="mb-5 text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary, #d1d5db)' }}>
            אירעה שגיאה בטעינת האפליקציה. אפשר לרענן ולהמשיך.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 px-4 py-3 text-sm font-black text-white transition hover:shadow-lg"
          >
            <RefreshCw className="h-4 w-4" />
            טען מחדש
          </button>
        </div>
      </div>
    );
  }
}
