import { NextRequest, NextResponse } from 'next/server';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { parseScheduleHTML } from '@/lib/productionScheduleParser';
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay } from '@/lib/productionDiff';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import { recordJobMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';
export const maxDuration = 300;

type CalendarSyncDoc = {
  url?: string;
  workerName?: string;
  savedAt?: number;
  lastSyncAt?: number;
  lastSyncStatus?: string;
  lastSyncCount?: number;
  lastSyncError?: string | null;
};

async function fetchHerzliyaHtml(url: string): Promise<{ personalHtml: string; deptHtml: string }> {
  const fetchOptions: RequestInit = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
    // @ts-expect-error - Node.js 20 experimental option
    rejectUnauthorized: false,
  };

  const deptUrl = new URL(url);
  deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');
  const deptUrl2 = new URL(url);
  deptUrl2.searchParams.set('showdept', '1');

  const [personalResponse, deptResult] = await Promise.all([
    fetch(url, fetchOptions),
    fetch(deptUrl.toString(), fetchOptions)
      .catch(() => fetch(deptUrl2.toString(), fetchOptions).catch(() => null)),
  ]);

  if (!personalResponse.ok) {
    throw new Error(`HTTP ${personalResponse.status} from Herzliya`);
  }

  const personalHtml = await personalResponse.text();
  const deptHtml = deptResult?.ok ? await deptResult.text() : '';

  return { personalHtml, deptHtml };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const syncDoc = await getDocument<CalendarSyncDoc>('system/calendarSync');
  const herzliyaUrl = syncDoc?.url?.trim();

  if (!herzliyaUrl) {
    await recordJobMetric({
      job: 'cron-sync-calendar',
      ok: false,
      message: 'אין כתובת יומן שמורה — המשתמש עדיין לא משך לוח',
    });
    return NextResponse.json({ ok: false, reason: 'no_url_stored' });
  }

  try {
    new URL(herzliyaUrl);
  } catch {
    await patchDocument('system/calendarSync', {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: 'invalid_url',
    } as unknown as Record<string, string>);
    return NextResponse.json({ ok: false, reason: 'invalid_url' });
  }

  const startedAt = Date.now();

  try {
    const { personalHtml, deptHtml } = await fetchHerzliyaHtml(herzliyaUrl);
    const parsed = parseScheduleHTML(personalHtml, deptHtml);

    if (parsed.productions.length === 0) {
      await Promise.all([
        patchDocument('system/calendarSync', {
          lastSyncAt: Date.now(),
          lastSyncStatus: 'empty',
          lastSyncCount: 0,
          lastSyncError: null,
        } as unknown as Record<string, string>),
        recordJobMetric({
          job: 'cron-sync-calendar',
          ok: false,
          message: 'לא נמצאו הפקות בתשובת הרצליה — ייתכן שהכתובת פגה',
          detail: { url: herzliyaUrl.substring(0, 60) },
        }),
      ]);
      return NextResponse.json({ ok: false, reason: 'empty_schedule', url: herzliyaUrl.substring(0, 60) });
    }

    // Assign IDs and Hebrew day names, then write to global_productions
    const productions = parsed.productions.map((prod) => ({
      ...prod,
      id: prod.id || generateProductionId(prod.name, prod.date, prod.studio),
      day: prod.day || getHebrewDay(prod.date),
    }));

    await Promise.allSettled(
      productions.map((prod) => {
        const doc: GlobalProductionDoc = toGlobalProduction(prod, 'system', 'cron/sync-calendar');
        return patchDocument(
          `global_productions/${doc.id}`,
          doc as unknown as Record<string, string>,
        );
      }),
    );

    // Background contacts sync — don't wait
    void syncContactsFromSavedProductions(true).catch((err) =>
      console.error('[cron/sync-calendar] contacts sync error:', err),
    );

    const elapsed = Date.now() - startedAt;

    await Promise.all([
      patchDocument('system/calendarSync', {
        lastSyncAt: Date.now(),
        lastSyncStatus: 'success',
        lastSyncCount: productions.length,
        lastSyncError: null,
      } as unknown as Record<string, string>),
      recordJobMetric({
        job: 'cron-sync-calendar',
        ok: true,
        message: `סנכרון יומן הושלם — ${productions.length} הפקות עודכנו`,
        detail: { count: productions.length, elapsed },
      }),
    ]);

    return NextResponse.json({ ok: true, count: productions.length, elapsed });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[cron/sync-calendar] error:', err);

    await Promise.all([
      patchDocument('system/calendarSync', {
        lastSyncAt: Date.now(),
        lastSyncStatus: 'error',
        lastSyncError: errorMsg.slice(0, 300),
      } as unknown as Record<string, string>),
      recordJobMetric({
        job: 'cron-sync-calendar',
        ok: false,
        message: 'שגיאה בסנכרון יומן הרצליה',
        detail: errorMsg,
      }),
    ]);

    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
