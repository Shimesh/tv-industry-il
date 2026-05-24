import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import {
  parseRatingsTable,
  enrichRows,
  israelDateAtUtcNoon,
  addDays,
  toIsoDate,
  toMidrugDate,
} from '@/lib/server/ratings';
import type { RatingsDailyDocument, RatingsWeeklyDocument } from '@/lib/ratingsTypes';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { RATINGS_MIDRUG_JOB } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const body = await request.json();
    const { dailyHtml, weeklyHtml, weekId, weekLabel } = body as {
      dailyHtml: string;
      weeklyHtml?: string;
      weekId?: string;
      weekLabel?: string;
    };

    if (!dailyHtml || typeof dailyHtml !== 'string') {
      return NextResponse.json({ error: 'dailyHtml is required' }, { status: 400 });
    }

    const now = new Date();
    const today = israelDateAtUtcNoon(now);
    const yesterday = addDays(today, -1);
    const previousDay = addDays(today, -2);
    const masterEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

    const dailyRows = parseRatingsTable(dailyHtml, 20);
    if (dailyRows.length === 0) {
      const detail = {
        source: 'browser-ingest',
        htmlLength: dailyHtml.length,
        hasTable: /<table/i.test(dailyHtml),
        hasRows: /<tr/i.test(dailyHtml),
        preview: dailyHtml.replace(/\s+/g, ' ').slice(0, 240),
      };
      await Promise.all([
        recordRouteMetric({ route: '/api/admin/ratings-ingest', ok: false, statusCode: 400, error: detail }),
        recordJobMetric({
          job: RATINGS_MIDRUG_JOB,
          ok: false,
          message: 'ייבוא מדרוג מהדפדפן נכשל: לא נמצאו שורות בטבלה',
          detail,
        }),
      ]);
      return NextResponse.json({ success: false, error: 'No ratings rows parsed', detail }, { status: 400 });
    }

    const firstRowDate = dailyRows[0]?.date;
    let sourceDate = yesterday;
    if (firstRowDate === toIsoDate(previousDay)) {
      sourceDate = previousDay;
    } else if (firstRowDate && firstRowDate !== toIsoDate(yesterday)) {
      sourceDate = new Date(firstRowDate + 'T12:00:00Z');
    }

    const dailyEnriched = enrichRows(dailyRows, masterEntries);
    const fetchedAt = new Date().toISOString();
    const dailyDoc: RatingsDailyDocument = {
      date: toIsoDate(sourceDate),
      sourceDate: toMidrugDate(sourceDate),
      targetAudience: 'משקי בית בכלל האוכלוסייה',
      top20: dailyEnriched.rows,
      fallbackUsed: false,
      fetchedAt,
    };
    await patchDocument(`ratings_daily/${dailyDoc.date}`, dailyDoc as unknown as Record<string, never>);

    const result: Record<string, unknown> = {
      daily: {
        date: dailyDoc.date,
        rows: dailyEnriched.rows.length,
        matched: dailyEnriched.matched,
        unmatched: dailyEnriched.unmatched,
      },
      source: 'browser-ingest',
    };

    if (weeklyHtml && weekId && weekLabel) {
      const weeklyRows = parseRatingsTable(weeklyHtml, 25);
      if (weeklyRows.length > 0) {
        const weeklyEnriched = enrichRows(weeklyRows, masterEntries);
        const weeklyDoc: RatingsWeeklyDocument = {
          weekId,
          weekRange: weekLabel,
          targetAudience: 'משקי בית בכלל האוכלוסייה',
          top25: weeklyEnriched.rows,
          fetchedAt,
        };
        await patchDocument(`ratings_weekly/week-${weekId}`, weeklyDoc as unknown as Record<string, never>);
        result.weekly = {
          weekId,
          weekRange: weekLabel,
          rows: weeklyEnriched.rows.length,
          matched: weeklyEnriched.matched,
          unmatched: weeklyEnriched.unmatched,
        };
      }
    }

    await Promise.all([
      recordRouteMetric({ route: '/api/admin/ratings-ingest', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: RATINGS_MIDRUG_JOB,
        ok: true,
        message: 'סנכרון רייטינג דרך הדפדפן הושלם בהצלחה',
        detail: result,
      }),
    ]);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({ route: '/api/admin/ratings-ingest', ok: false, statusCode: 500, error }),
      recordJobMetric({
        job: RATINGS_MIDRUG_JOB,
        ok: false,
        message: 'ייבוא מדרוג מהדפדפן נכשל',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Ingest failed' },
      { status: 500 },
    );
  }
}
