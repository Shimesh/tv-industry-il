import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { fromGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { runQuery } from '@/lib/server/firestoreAdminRest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 });
  }

  if (!datePattern.test(weekStart) || !datePattern.test(weekEnd)) {
    return NextResponse.json({ error: 'Invalid date format - expected YYYY-MM-DD' }, { status: 400 });
  }

  try {
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

    // Compatibility endpoint: read the canonical global calendar source.
    const byId = new Map<string, GlobalProductionDoc>();
    for (const doc of docs) {
      if (!doc.id || !doc.date || !doc.name) continue;
      const existing = byId.get(doc.id);
      if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
        byId.set(doc.id, doc);
      }
    }

    const productions = Array.from(byId.values()).map(fromGlobalProduction);

    recordRouteMetric({ route: '/api/productions/week', ok: true, statusCode: 200 }).catch(() => {});

    return NextResponse.json({ success: true, count: productions.length, productions });
  } catch (error) {
    recordRouteMetric({ route: '/api/productions/week', ok: false, statusCode: 500, error }).catch(() => {});
    return NextResponse.json({ success: false, count: 0, productions: [] });
  }
}
