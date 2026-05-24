import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getRecentSystemEvents, getUsageSnapshot, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { listDocuments } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type ClientSystemLogRecord = {
  id: string;
  createdAt?: string;
  level?: string;
  source?: string;
  version?: string | null;
  uid?: string | null;
  name?: string | null;
  message?: string;
  stack?: string | null;
  pathname?: string | null;
  href?: string | null;
  userAgent?: string | null;
};

function toTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function simplifyClientError(log: ClientSystemLogRecord) {
  return {
    id: log.id,
    createdAt: log.createdAt || null,
    source: log.source || 'client',
    version: log.version || null,
    uid: log.uid || null,
    name: log.name || null,
    message: log.message || 'Unknown client error',
    pathname: log.pathname || null,
    href: log.href || null,
    stack: log.stack ? log.stack.slice(0, 1200) : null,
    userAgent: log.userAgent || null,
  };
}

function isBrowserExtensionNoise(log: ClientSystemLogRecord): boolean {
  const combined = [
    log.source,
    log.message,
    log.stack,
    log.href,
    log.pathname,
  ].filter(Boolean).join('\n');

  return combined.includes('chrome-extension://') ||
    combined.includes('moz-extension://') ||
    combined.includes('safari-web-extension://');
}

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const [recentEvents, usage, clientLogs] = await Promise.all([
      getRecentSystemEvents(25),
      getUsageSnapshot(),
      listDocuments<ClientSystemLogRecord>('client_system_logs').catch(() => []),
    ]);

    const clientErrors = clientLogs
      .filter((log) => !isBrowserExtensionNoise(log))
      .sort((a, b) => toTime(b.createdAt).valueOf() - toTime(a.createdAt).valueOf())
      .slice(0, 20)
      .map(simplifyClientError);

    const routeFailures = usage.routeHealth.filter((route) => route.failureCount > 0 || route.lastError);
    const systemErrors = recentEvents.filter((event) => event.level === 'error' || event.level === 'warn');

    const suggestedActions = [
      ...(clientErrors.length
        ? ['נמצאו שגיאות לקוח אחרונות. מומלץ לבדוק את הנתיב ואת ה־stack לפני פריסה נוספת.']
        : ['לא נמצאו שגיאות לקוח אחרונות מתוך האפליקציה.']),
      ...(routeFailures.length
        ? ['יש נתיבי API עם כשלים אחרונים. בדקו את פירוט routeHealth.']
        : ['נתיבי ה־API האחרונים נראים תקינים.']),
      ...(systemErrors.length
        ? ['יש אירועי מערכת ברמת אזהרה או שגיאה.']
        : ['אין אירועי מערכת חריגים ברשימה האחרונה.']),
    ];

    const allowedFixes = [
      {
        actionId: 'clear_stale_presence',
        label: 'נקה נוכחות תקועה',
        description: 'מסמן משתמשים שלא נראו מעל שעה כלא מחוברים. לא מוחק נתונים.',
      },
      {
        actionId: 'refresh_diagnostics',
        label: 'רענן אבחון',
        description: 'טוען מחדש את תמונת התקלות בלי לבצע שינוי.',
      },
    ];

    await recordRouteMetric({ route: '/api/admin/chat-diagnostics', ok: true, statusCode: 200 });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      recentEvents,
      routeHealth: usage.routeHealth,
      jobs: usage.jobs,
      clientErrors,
      suggestedActions,
      allowedFixes,
    });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/chat-diagnostics',
      ok: false,
      statusCode: 500,
      error,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load chat diagnostics' },
      { status: 500 },
    );
  }
}
