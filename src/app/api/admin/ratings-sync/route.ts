import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { scrapeAndSaveRatings } from '@/lib/server/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await scrapeAndSaveRatings({ forceWeekly: body?.forceWeekly !== false, allowCachedFallback: true });
    await Promise.all([
      recordRouteMetric({ route: '/api/admin/ratings-sync', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'ratings-scrape',
        ok: !result.cachedFallback,
        message: result.cachedFallback
          ? 'מקור המדרוג לא נגיש כרגע מ-Vercel; הנתונים השמורים האחרונים נשארו פעילים'
          : 'סנכרון ידני של נתוני הרייטינג הושלם בהצלחה',
        detail: result,
      }),
    ]);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({
        route: '/api/admin/ratings-sync',
        ok: false,
        statusCode: 500,
        error,
      }),
      recordJobMetric({
        job: 'ratings-scrape',
        ok: false,
        message: 'סנכרון ידני של נתוני הרייטינג נכשל',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Ratings sync failed' },
      { status: 500 },
    );
  }
}
