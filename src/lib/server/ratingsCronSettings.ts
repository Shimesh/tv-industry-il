import { getDocument } from '@/lib/server/firestoreAdminRest';

export const RATINGS_CRON_SCHEDULE = '0 6 * * *';
export const RATINGS_CRON_TIMEZONE = 'UTC';
export const RATINGS_HOT_WINDOW = '09:00-09:20 Asia/Jerusalem';

export type RatingsAutomationSettings = {
  midrugEnabled: boolean;
  telegramEnabled: boolean;
  weeklyMode: 'sunday' | 'always';
};

export async function getRatingsAutomationSettings(): Promise<RatingsAutomationSettings> {
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

export function israelDateAtUtcNoon(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function expectedTelegramRatingsDate(now = new Date()): string {
  return toIsoDate(addDays(israelDateAtUtcNoon(now), -1));
}

