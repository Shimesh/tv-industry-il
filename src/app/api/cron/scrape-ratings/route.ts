import { NextRequest, NextResponse } from 'next/server';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { getDocument } from '@/lib/server/firestoreAdminRest';
import { runMidrugRatingsJob, runTelegramRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

async function getRatingsAutomationSettings() {
  const config = await getDocument<{
    ratingsAutomation?: {
      midrugEnabled?: boolean;
      telegramEnabled?: boolean;
      weeklyMode?: 'sunday' | 'always';
    };
  }>('appConfig/global').catch(() => null);

  return {
    midrugEnabled: config?.ratingsAutomation?.midrugEnabled !== false,
    telegramEnabled: config?.ratingsAutomation?.telegramEnabled !== false,
    weeklyMode: config?.ratingsAutomation?.weeklyMode === 'always' ? 'always' : 'sunday',
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const explicitSource = request.nextUrl.searchParams.get('source');
  const source = explicitSource || 'all';
  const settings = await getRatingsAutomationSettings();
  const forceWeeklyParam = request.nextUrl.searchParams.get('forceWeekly');
  const forceWeekly = forceWeeklyParam === '1' || (forceWeeklyParam !== '0' && settings.weeklyMode === 'always');
  const actions: Array<Record<string, unknown>> = [];

  if ((source === 'all' || source === 'midrug') && (explicitSource === 'midrug' || settings.midrugEnabled)) {
    try {
      actions.push(await runMidrugRatingsJob({
        route: '/api/cron/scrape-ratings',
        trigger: 'cron',
        forceWeekly,
      }));
    } catch (error) {
      actions.push({ success: false, source: 'midrug', error: errorMessage(error) });
    }
  } else if (source === 'all' || source === 'midrug') {
    actions.push({ success: true, source: 'midrug', skipped: true, reason: 'disabled in admin settings' });
  }

  if ((source === 'all' || source === 'telegram') && (explicitSource === 'telegram' || settings.telegramEnabled)) {
    try {
      actions.push(await runTelegramRatingsJob({
        route: '/api/cron/scrape-ratings',
        trigger: 'cron',
      }));
    } catch (error) {
      actions.push({ success: false, source: 'telegram', error: errorMessage(error) });
    }
  } else if (source === 'all' || source === 'telegram') {
    actions.push({ success: true, source: 'telegram', skipped: true, reason: 'disabled in admin settings' });
  }

  const ok = actions.some((action) => action.success === true);
  await Promise.all([
    recordRouteMetric({ route: '/api/cron/scrape-ratings', ok, statusCode: ok ? 200 : 500, error: ok ? undefined : actions }),
    recordJobMetric({
      job: 'ratings-scrape',
      ok,
      message: ok ? 'Cron ratings sync completed' : 'Cron ratings sync failed',
      detail: { source, forceWeekly, settings, actions },
    }),
  ]);

  return NextResponse.json(
    { success: ok, source, forceWeekly, settings, actions },
    { status: ok ? 200 : 500 },
  );
}
