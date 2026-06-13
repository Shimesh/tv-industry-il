import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, getCurrentWeekStartIsrael, getPreviousWeekStart } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

type UserCalendarSync = {
  id: string;
  uid?: string;
  url?: string;
  workerName?: string;
  weekStart?: string;
  savedAt?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!secret || secret !== process.env.ADMIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const currentWeek = getCurrentWeekStartIsrael();
  const previousWeek = getPreviousWeekStart(currentWeek);
  const eligibleWeeks = new Set([currentWeek, previousWeek]);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const allDocs = await listDocuments<UserCalendarSync>('user_calendar_sync');

  const eligible = allDocs.filter(
    (doc) =>
      doc.url &&
      (eligibleWeeks.has(doc.weekStart ?? '') || (doc.savedAt && doc.savedAt >= sevenDaysAgo)),
  );

  if (!eligible.length) {
    return NextResponse.json({ ok: true, message: 'no eligible calendars', synced: 0 });
  }

  const results = await Promise.allSettled(
    eligible.map(async (doc) => {
      const uid = doc.id;
      const url = doc.url!;
      try {
        const result = await syncHerzliyaUrl(uid, url);
        const patch: Record<string, unknown> = {
          lastSyncAt: Date.now(),
          lastSyncStatus: result.status,
          lastSyncCount: result.status === 'success' ? result.count : 0,
          lastSyncError: result.status === 'error' ? result.error : null,
        };
        if (result.status === 'success' && result.finalUrl) {
          patch.url = result.finalUrl;
        }
        await patchDocument(`user_calendar_sync/${uid}`, patch as Record<string, string>).catch(() => {});
        return { uid, status: result.status, count: result.status === 'success' ? result.count : 0 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await patchDocument(`user_calendar_sync/${uid}`, {
          lastSyncAt: Date.now(),
          lastSyncStatus: 'error',
          lastSyncError: msg.slice(0, 300),
        } as unknown as Record<string, string>).catch(() => {});
        return { uid, status: 'error', error: msg.slice(0, 200) };
      }
    }),
  );

  const summary = results.map((r) => (r.status === 'fulfilled' ? r.value : { status: 'rejected' }));
  const successCount = summary.filter((r) => r.status === 'success').length;

  console.log(`[sync-all-calendars] ${successCount}/${eligible.length} succeeded`);

  return NextResponse.json({ ok: true, synced: successCount, total: eligible.length, results: summary });
}
