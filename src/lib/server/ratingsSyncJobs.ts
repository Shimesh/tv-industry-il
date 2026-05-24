import { recordJobMetric, recordJobStarted, recordRouteMetric } from '@/lib/server/adminTelemetry';
import { scrapeAndSaveRatings } from '@/lib/server/ratings';
import { hasTelegramRatingsConfig, importLatestTelegramRatings } from '@/lib/server/telegramRatings';

export const RATINGS_MIDRUG_JOB = 'ratings-midrug-scrape';
export const RATINGS_TELEGRAM_JOB = 'ratings-telegram-scopt';

type RatingsJobInput = {
  route: string;
  trigger: 'admin' | 'cron';
  forceWeekly?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

export async function runMidrugRatingsJob(input: RatingsJobInput) {
  const startedAt = new Date().toISOString();
  const detailBase = {
    source: 'midrug',
    trigger: input.trigger,
    forceWeekly: Boolean(input.forceWeekly),
    startedAt,
    steps: [
      'started',
      'fetch daily AJAX table',
      'parse top 20 rows',
      'enrich rows from industry_master',
      'save ratings_daily',
      input.forceWeekly ? 'fetch weekly AJAX table and save ratings_weekly' : 'weekly skipped unless Sunday or forced',
    ],
  };

  await recordJobStarted({
    job: RATINGS_MIDRUG_JOB,
    message: 'משיכת רייטינג ממדרוג התחילה',
    detail: detailBase,
  });

  try {
    const result = await scrapeAndSaveRatings({
      forceWeekly: input.forceWeekly,
      allowCachedFallback: false,
    });
    const detail = {
      ...detailBase,
      completedAt: new Date().toISOString(),
      dailyDate: result.daily.date,
      dailyRows: result.daily.rows,
      fallbackUsed: result.daily.fallbackUsed,
      dailyMatched: result.daily.matched,
      dailyUnmatched: result.daily.unmatched,
      weeklyRows: result.weekly?.rows ?? 0,
      weeklyRange: result.weekly?.weekRange ?? null,
      warning: result.warning ?? null,
    };

    await Promise.all([
      recordRouteMetric({ route: input.route, ok: true, statusCode: 200 }),
      recordJobMetric({
        job: RATINGS_MIDRUG_JOB,
        ok: true,
        message: `משיכת מדרוג הושלמה: ${result.daily.rows} שורות יומיות${result.weekly ? `, ${result.weekly.rows} שבועיות` : ''}`,
        detail,
      }),
    ]);

    return { success: true, source: 'midrug' as const, trigger: input.trigger, steps: detail.steps, ...result };
  } catch (error) {
    const detail = {
      ...detailBase,
      failedAt: new Date().toISOString(),
      error: errorMessage(error),
    };
    await Promise.all([
      recordRouteMetric({ route: input.route, ok: false, statusCode: 500, error }),
      recordJobMetric({
        job: RATINGS_MIDRUG_JOB,
        ok: false,
        message: 'משיכת רייטינג ממדרוג נכשלה',
        detail,
      }),
    ]);
    throw error;
  }
}

export async function runTelegramRatingsJob(input: RatingsJobInput) {
  const startedAt = new Date().toISOString();
  const detailBase = {
    source: 'telegram-scopt',
    trigger: input.trigger,
    startedAt,
    steps: [
      'started',
      'connect to Telegram',
      'read latest Scopt channel messages',
      'parse ratings message',
      'save telegram fields into ratings_daily',
    ],
  };

  await recordJobStarted({
    job: RATINGS_TELEGRAM_JOB,
    message: 'משיכת רייטינג מ-Scopt Telegram התחילה',
    detail: detailBase,
  });

  try {
    if (!hasTelegramRatingsConfig()) {
      throw new Error('Telegram ratings configuration is missing');
    }

    const result = await importLatestTelegramRatings();
    const detail = {
      ...detailBase,
      completedAt: new Date().toISOString(),
      date: result.daily.date,
      rows: result.daily.rows,
      sourceMessageId: result.sourceMessageId,
    };

    await Promise.all([
      recordRouteMetric({ route: input.route, ok: true, statusCode: 200 }),
      recordJobMetric({
        job: RATINGS_TELEGRAM_JOB,
        ok: true,
        message: `משיכת Scopt Telegram הושלמה: ${result.daily.rows} שורות`,
        detail,
      }),
    ]);

    return { success: true, trigger: input.trigger, steps: detail.steps, ...result };
  } catch (error) {
    const detail = {
      ...detailBase,
      failedAt: new Date().toISOString(),
      error: errorMessage(error),
    };
    await Promise.all([
      recordRouteMetric({ route: input.route, ok: false, statusCode: 500, error }),
      recordJobMetric({
        job: RATINGS_TELEGRAM_JOB,
        ok: false,
        message: 'משיכת רייטינג מ-Scopt Telegram נכשלה',
        detail,
      }),
    ]);
    throw error;
  }
}

