import { NextRequest, NextResponse } from 'next/server';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { runMidrugRatingsJob, runTelegramRatingsJob } from '@/lib/server/ratingsSyncJobs';

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

  const source = request.nextUrl.searchParams.get('source') || 'all';
  const forceWeekly = request.nextUrl.searchParams.get('forceWeekly') === '1';
  const actions: Array<Record<string, unknown>> = [];

  if (source === 'all' || source === 'midrug') {
    try {
      actions.push(await runMidrugRatingsJob({
        route: '/api/cron/scrape-ratings',
        trigger: 'cron',
        forceWeekly,
      }));
    } catch (error) {
      actions.push({ success: false, source: 'midrug', error: errorMessage(error) });
    }
  }

  if (source === 'all' || source === 'telegram') {
    try {
      actions.push(await runTelegramRatingsJob({
        route: '/api/cron/scrape-ratings',
        trigger: 'cron',
      }));
    } catch (error) {
      actions.push({ success: false, source: 'telegram', error: errorMessage(error) });
    }
  }

  const ok = actions.some((action) => action.success === true);
  await Promise.all([
    recordRouteMetric({ route: '/api/cron/scrape-ratings', ok, statusCode: ok ? 200 : 500, error: ok ? undefined : actions }),
    recordJobMetric({
      job: 'ratings-scrape',
      ok,
      message: ok ? 'Cron ratings sync completed' : 'Cron ratings sync failed',
      detail: { source, forceWeekly, actions },
    }),
  ]);

  return NextResponse.json(
    { success: ok, source, forceWeekly, actions },
    { status: ok ? 200 : 500 },
  );
}

