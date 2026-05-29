import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, type UserCalendarSyncDoc } from '@/lib/server/herzliyaSync';
import { recordJobMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allUsers = await listDocuments<UserCalendarSyncDoc>('user_calendar_sync').catch(() => []);
  const activeUsers = allUsers.filter(u => u.url?.trim());

  if (activeUsers.length === 0) {
    await recordJobMetric({ job: 'cron-sync-calendar', ok: false, message: 'אין משתמשים עם לינק יומן שמור' });
    return NextResponse.json({ ok: false, reason: 'no_users' });
  }

  const startedAt = Date.now();
  const results: Array<{ uid: string; status: string; count?: number; error?: string }> = [];

  // Sync each user sequentially to avoid overloading the Herzliya server
  for (const user of activeUsers) {
    const uid = user.uid || (user as Record<string, unknown>).id as string;
    const url = user.url.trim();

    try {
      new URL(url);
    } catch {
      results.push({ uid, status: 'invalid_url' });
      continue;
    }

    try {
      const result = await syncHerzliyaUrl(uid, url);
      results.push({ uid, status: result.status, count: result.status === 'success' ? result.count : undefined });

      await patchDocument(`user_calendar_sync/${uid}`, {
        lastSyncAt: Date.now(),
        lastSyncStatus: result.status,
        lastSyncCount: result.status === 'success' ? result.count : 0,
        lastSyncError: result.status === 'error' ? result.error : null,
      } as unknown as Record<string, string>);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ uid, status: 'error', error: errorMsg });
      await patchDocument(`user_calendar_sync/${uid}`, {
        lastSyncAt: Date.now(),
        lastSyncStatus: 'error',
        lastSyncError: errorMsg.slice(0, 300),
      } as unknown as Record<string, string>).catch(() => {});
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const totalProductions = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const elapsed = Date.now() - startedAt;

  await recordJobMetric({
    job: 'cron-sync-calendar',
    ok: successCount > 0,
    message: `סנכרון יומן: ${successCount}/${activeUsers.length} משתמשים הצליחו, ${totalProductions} הפקות`,
    detail: { results, elapsed },
  });

  return NextResponse.json({ ok: true, users: activeUsers.length, success: successCount, productions: totalProductions, elapsed, results });
}
