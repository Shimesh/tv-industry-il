import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { runQuery } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import type { Production } from '@/lib/productionDiff';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RawProductionDoc = Record<string, unknown> & { id?: string };

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
    return NextResponse.json({ error: 'Invalid date format — expected YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const docs = await runQuery<RawProductionDoc>({
      from: [{ collectionId: 'productions', allDescendants: true }],
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

    // Dedup by production id — prefer the most recently updated version
    const byId = new Map<string, RawProductionDoc>();
    for (const doc of docs) {
      const id = doc.id as string | undefined;
      if (!id || !doc.date || !doc.name) continue; // skip week-metadata docs without production fields
      const existing = byId.get(id);
      if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
        byId.set(id, doc);
      }
    }

    const productions = Array.from(byId.values()) as unknown as Production[];

    recordRouteMetric({ route: '/api/productions/week', ok: true, statusCode: 200 }).catch(() => {});

    return NextResponse.json({ success: true, count: productions.length, productions });
  } catch (error) {
    recordRouteMetric({ route: '/api/productions/week', ok: false, statusCode: 500, error }).catch(() => {});
    return NextResponse.json({ success: false, count: 0, productions: [] });
  }
}
