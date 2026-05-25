import { NextRequest, NextResponse } from 'next/server';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { expectedTelegramRatingsDate, getRatingsAutomationSettings } from '@/lib/server/ratingsCronSettings';
import { runTelegramRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getRatingsAutomationSettings();
  const expectedDate = request.nextUrl.searchParams.get('expectedDate') || expectedTelegramRatingsDate();

  if (!settings.telegramEnabled) {
    const detail = { source: 'telegram', expectedDate, skipped: true, reason: 'disabled in admin settings' };
    await Promise.all([
      recordRouteMetric({ route: '/api/cron/scrape-ratings/telegram', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'ratings-telegram-scopt',
        ok: true,
        message: 'Scopt Telegram cron skipped by admin settings',
        detail,
      }),
    ]);
    return NextResponse.json({ success: true, ...detail });
  }

  try {
    const result = await runTelegramRatingsJob({
      route: '/api/cron/scrape-ratings/telegram',
      trigger: 'cron',
      expectedDate,
      skipIfAlreadyImported: true,
      waitingOk: true,
    });
    return NextResponse.json({ ...result, expectedDate });
  } catch (error) {
    const message = errorMessage(error);
    const waiting = message.includes(`No Scopt ratings message found for ${expectedDate}`);
    const detail = { source: 'telegram', expectedDate, error: errorMessage(error) };
    return NextResponse.json({ success: false, waiting, ...detail }, { status: waiting ? 202 : 500 });
  }
}
