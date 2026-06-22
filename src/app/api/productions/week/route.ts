import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { fromGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { splitHerzliyaRole } from '@/lib/productionScheduleParser';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { runQuery, getDocument } from '@/lib/server/firestoreAdminRest';
import { resolveCalendarAccessMode, type CalendarPreviewMode } from '@/lib/calendarAccess';

type CalendarSyncDoc = {
  lastSyncAt?: number;
  lastSyncStatus?: string;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');
  const requestedViewMode = searchParams.get('viewMode');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 });
  }

  if (!datePattern.test(weekStart) || !datePattern.test(weekEnd)) {
    return NextResponse.json({ error: 'Invalid date format - expected YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const [userDoc, userSyncDoc, systemSyncDoc] = await Promise.all([
      getDocument<Record<string, unknown>>(`users/${authUser.uid}`).catch(() => null),
      getDocument<CalendarSyncDoc>(`user_calendar_sync/${authUser.uid}`).catch(() => null),
      getDocument<CalendarSyncDoc>('system/calendarSync').catch(() => null),
    ]);

    const previewMode: CalendarPreviewMode =
      userDoc?.siteRole === 'admin' && (requestedViewMode === 'full' || requestedViewMode === 'personal')
        ? requestedViewMode
        : 'policy';
    const calendarMode = resolveCalendarAccessMode(userDoc, previewMode);
    const lastSyncAt = userSyncDoc?.lastSyncAt ?? systemSyncDoc?.lastSyncAt ?? null;
    const lastSyncStatus = userSyncDoc?.lastSyncStatus ?? systemSyncDoc?.lastSyncStatus ?? null;

    if (calendarMode !== 'full') {
      recordRouteMetric({ route: '/api/productions/week', ok: true, statusCode: 200 }).catch(() => {});
      return NextResponse.json({
        success: true,
        count: 0,
        productions: [],
        calendarMode,
        lastSyncAt,
        lastSyncStatus,
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' },
      });
    }

    const docs = await runQuery<GlobalProductionDoc>({
      from: [{ collectionId: 'global_productions' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'date' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { stringValue: weekStart },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'date' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { stringValue: weekEnd },
              },
            },
          ],
        },
      },
      limit: 500,
    });

    // Dedup by Firestore ID (handles re-uploads of the same document)
    const byId = new Map<string, GlobalProductionDoc>();
    for (const doc of docs) {
      if (!doc.id || !doc.date || !doc.name) continue;
      const existing = byId.get(doc.id);
      if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
        byId.set(doc.id, doc);
      }
    }

    // Second dedup: by herzliyaId+date — merges old (name+role) and new (clean name) entries
    const byHerzliya = new Map<string, GlobalProductionDoc>();
    const noHerzliyaId: GlobalProductionDoc[] = [];
    for (const doc of byId.values()) {
      if (doc.herzliyaId) {
        const key = `${doc.herzliyaId}::${doc.date}`;
        const existing = byHerzliya.get(key);
        if (!existing) {
          byHerzliya.set(key, doc);
        } else {
          // Prefer the entry with more crew; on tie prefer newer lastUpdatedAt
          const useIncoming =
            doc.crew_list.length > existing.crew_list.length ||
            (doc.crew_list.length === existing.crew_list.length &&
              String(doc.lastUpdatedAt) > String(existing.lastUpdatedAt));
          const winner = useIncoming ? doc : existing;
          // Always use the shorter (role-stripped) name
          const existingClean = splitHerzliyaRole(existing.name).name || existing.name;
          const incomingClean = splitHerzliyaRole(doc.name).name || doc.name;
          const cleanName = existingClean.length <= incomingClean.length ? existingClean : incomingClean;
          byHerzliya.set(key, { ...winner, name: cleanName });
        }
      } else {
        noHerzliyaId.push(doc);
      }
    }

    // Strip role suffix from all remaining names (cleans old Firestore entries)
    const cleanDoc = (doc: GlobalProductionDoc): GlobalProductionDoc => {
      const { name } = splitHerzliyaRole(doc.name);
      return name && name !== doc.name ? { ...doc, name } : doc;
    };

    const productions = [
      ...Array.from(byHerzliya.values()).map(cleanDoc),
      ...noHerzliyaId.map(cleanDoc),
    ].map(fromGlobalProduction);

    recordRouteMetric({ route: '/api/productions/week', ok: true, statusCode: 200 }).catch(() => {});

    return NextResponse.json({
      success: true,
      count: productions.length,
      productions,
      calendarMode,
      lastSyncAt,
      lastSyncStatus,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' },
    });
  } catch (error) {
    recordRouteMetric({ route: '/api/productions/week', ok: false, statusCode: 500, error }).catch(() => {});
    return NextResponse.json({ success: false, count: 0, productions: [] });
  }
}
