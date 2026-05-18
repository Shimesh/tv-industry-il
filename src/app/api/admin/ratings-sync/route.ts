import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { scrapeAndSaveRatings } from '@/lib/server/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

const FIREBASE_FN_URL = process.env.RATINGS_FIREBASE_FN_URL || '';

async function tryFirebaseFunction(): Promise<{ success: boolean; date?: string; rows?: number }> {
  if (!FIREBASE_FN_URL) throw new Error('RATINGS_FIREBASE_FN_URL not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  const res = await fetch(FIREBASE_FN_URL, { signal: controller.signal, cache: 'no-store' });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`Firebase fn HTTP ${res.status}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const fbResult = await tryFirebaseFunction();
    if (fbResult.success) {
      await Promise.all([
        recordRouteMetric({ route: '/api/admin/ratings-sync', ok: true, statusCode: 200 }),
        recordJobMetric({
          job: 'ratings-scrape',
          ok: true,
          message: `סנכרון רייטינג דרך Firebase Israel הושלם: ${fbResult.rows || 0} תוכניות`,
          detail: fbResult,
        }),
      ]);
      return NextResponse.json({ ...fbResult, source: 'firebase-il' });
    }
    throw new Error('Firebase function returned failure');
  } catch (fbError) {
    console.log('Firebase fn failed, falling back to direct:', fbError instanceof Error ? fbError.message : fbError);
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
      recordRouteMetric({ route: '/api/admin/ratings-sync', ok: false, statusCode: 500, error }),
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
