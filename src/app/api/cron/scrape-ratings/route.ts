import { NextRequest, NextResponse } from 'next/server';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { scrapeAndSaveRatings } from '@/lib/server/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const forceWeekly = request.nextUrl.searchParams.get('forceWeekly') === '1';

  try {
    const result = await scrapeAndSaveRatings({ forceWeekly, allowCachedFallback: true });
    await Promise.all([
      recordRouteMetric({ route: '/api/cron/scrape-ratings', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'ratings-scrape',
        ok: !result.cachedFallback,
        message: result.cachedFallback
          ? 'מקור המדרוג לא נגיש כרגע מ-Vercel; הנתונים השמורים האחרונים נשארו פעילים'
          : 'סנכרון נתוני הרייטינג הושלם בהצלחה',
        detail: result,
      }),
    ]);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({
        route: '/api/cron/scrape-ratings',
        ok: false,
        statusCode: 500,
        error,
      }),
      recordJobMetric({
        job: 'ratings-scrape',
        ok: false,
        message: 'סנכרון נתוני הרייטינג נכשל',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Ratings scrape failed' },
      { status: 500 },
    );
  }
}

