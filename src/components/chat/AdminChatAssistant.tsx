'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type DiagnosticAction = {
  actionId: string;
  label: string;
  description: string;
};

type DiagnosticResponse = {
  generatedAt: string;
  recentEvents: Array<{
    id: string;
    level: 'info' | 'success' | 'warn' | 'error';
    type: string;
    message: string;
    detail?: string | null;
    route?: string | null;
    job?: string | null;
    createdAt: string;
  }>;
  routeHealth: Array<{
    key: string;
    label: string;
    failureCount: number;
    lastStatusCode: number | null;
    lastError: string | null;
  }>;
  clientErrors: Array<{
    id: string;
    createdAt: string | null;
    source: string;
    uid: string | null;
    message: string;
    pathname: string | null;
  }>;
  suggestedActions: string[];
  allowedFixes: DiagnosticAction[];
};

type ActionResult = {
  ok?: boolean;
  message?: string;
  error?: string;
};

function formatRelative(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const diff = Date.now() - parsed;
  if (diff < 60_000) return 'עכשיו';
  if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`;
  if (diff < 86_400_000) return `לפני ${Math.floor(diff / 3_600_000)} שע׳`;
  return new Date(parsed).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function AdminChatAssistant() {
  const { user } = useAuth();
  const [diagnostics, setDiagnostics] = useState<DiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/chat-diagnostics', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'טעינת האבחון נכשלה');
      }
      setDiagnostics(payload as DiagnosticResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'טעינת האבחון נכשלה');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const runAction = useCallback(async (actionId: string) => {
    if (!user) return;
    setRunningAction(actionId);
    setActionResult(null);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/chat-diagnostics/actions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionId }),
      });
      const payload = (await response.json().catch(() => ({}))) as ActionResult;
      if (!response.ok) {
        throw new Error(payload.error || 'הפעולה נכשלה');
      }
      setActionResult(payload);
      await loadDiagnostics();
    } catch (actionError) {
      setActionResult({
        ok: false,
        error: actionError instanceof Error ? actionError.message : 'הפעולה נכשלה',
      });
    } finally {
      setRunningAction(null);
    }
  }, [loadDiagnostics, user]);

  const topIssues = useMemo(() => {
    if (!diagnostics) return [];
    const events = diagnostics.recentEvents.filter((event) => event.level === 'error' || event.level === 'warn').slice(0, 2);
    const clientErrors = diagnostics.clientErrors.slice(0, 2).map((log) => ({
      id: log.id,
      level: 'error' as const,
      type: log.source,
      message: log.message,
      createdAt: log.createdAt || '',
      route: log.pathname,
    }));
    return [...events, ...clientErrors].slice(0, 3);
  }, [diagnostics]);

  return (
    <section
      className="border-b px-3 py-3"
      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      dir="rtl"
      aria-label="עוזר ניהול לצ׳אט"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-[var(--theme-text)]">עוזר ניהול</h3>
            <p className="truncate text-[11px] text-[var(--theme-text-secondary)]">אבחון תקלות ופעולות בטוחות</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadDiagnostics()}
          disabled={loading}
          className="rounded-full p-2 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-accent-glow)] disabled:opacity-50"
          title="רענן אבחון"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {!error && !diagnostics && loading ? (
        <p className="text-xs text-[var(--theme-text-secondary)]">טוען אבחון...</p>
      ) : null}

      {diagnostics ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
              <p className="text-base font-bold text-[var(--theme-text)]">{diagnostics.clientErrors.length}</p>
              <p className="text-[10px] text-[var(--theme-text-secondary)]">שגיאות לקוח</p>
            </div>
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
              <p className="text-base font-bold text-[var(--theme-text)]">
                {diagnostics.routeHealth.filter((route) => route.failureCount > 0 || route.lastError).length}
              </p>
              <p className="text-[10px] text-[var(--theme-text-secondary)]">נתיבי API</p>
            </div>
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
              <p className="text-base font-bold text-[var(--theme-text)]">{topIssues.length}</p>
              <p className="text-[10px] text-[var(--theme-text-secondary)]">חריגים</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {topIssues.length ? topIssues.map((issue) => (
              <div key={`${issue.id}-${issue.type}`} className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-200">
                    <AlertTriangle className="h-3 w-3" />
                    {issue.type}
                  </span>
                  <span className="text-[10px] text-orange-100/70">{formatRelative(issue.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-orange-50">{issue.message}</p>
                {issue.route ? <p className="mt-1 truncate text-[10px] text-orange-100/70" dir="ltr">{issue.route}</p> : null}
              </div>
            )) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                לא נמצאו תקלות חריגות באבחון האחרון.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {diagnostics.allowedFixes.map((action) => (
              <button
                key={action.actionId}
                type="button"
                onClick={() => void runAction(action.actionId)}
                disabled={Boolean(runningAction)}
                title={action.description}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-accent-glow)] disabled:opacity-50"
                style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
              >
                <Wrench className={`h-3.5 w-3.5 ${runningAction === action.actionId ? 'animate-spin' : ''}`} />
                {action.label}
              </button>
            ))}
          </div>

          {actionResult ? (
            <p className={`rounded-lg border p-2 text-xs ${actionResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}>
              {actionResult.message || actionResult.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
