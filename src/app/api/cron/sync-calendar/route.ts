import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, getCurrentWeekStartIsrael, type UserCalendarSyncDoc } from '@/lib/server/herzliyaSync';
import { recordJobMetric } from '@/lib/server/adminTelemetry';
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import type { Production } from '@/lib/productionDiff';

type RawProductionDoc = Record<string, unknown> & {
  id?: string;
  date?: string;
  name?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  _path?: string;
  crew?: unknown[];
};

async function migrateGlobalProductions(): Promise<{ written: number; unique: number; errors: number }> {
  const allDocs = await runQuery<RawProductionDoc>({
    from: [{ collectionId: 'productions', allDescendants: true }],
    limit: 5000,
  });

  const filtered = allDocs.filter((doc) => {
    const path = String(doc._path || '');
    return path.includes('/weeks/') && !!doc.name && !!doc.date && Array.isArray(doc.crew);
  });

  const byId = new Map<string, RawProductionDoc>();
  for (const doc of filtered) {
    const id = doc.id as string | undefined;
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
      byId.set(id, doc);
    }
  }

  const unique = Array.from(byId.values());
  let written = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (raw) => {
        const prod = raw as unknown as Production;
        if (!prod.id || !prod.date || !prod.name) return;
        const parts = String(raw._path || '').split('/');
        const weeksIdx = parts.indexOf('weeks');
        const sourcePath = weeksIdx >= 0 ? parts.slice(0, weeksIdx + 2).join('/') : String(raw._path || '');
        const uploaderUid = (raw.lastUpdatedBy as string) || 'migration';
        const doc: GlobalProductionDoc = toGlobalProduction(prod, uploaderUid, sourcePath);
        await patchDocument(
          `global_productions/${doc.id}`,
          doc as unknown as Record<string, string>,
        );
        written++;
      }),
    );
    errors += results.filter((r) => r.status === 'rejected').length;
  }

  return { written, unique: unique.length, errors };
}

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentWeekStart = getCurrentWeekStartIsrael();
  const allUsers = await listDocuments<UserCalendarSyncDoc>('user_calendar_sync').catch(() => []);

  // Only sync users whose saved URL belongs to the current week
  const activeUsers = allUsers.filter(u => u.url?.trim() && u.weekStart === currentWeekStart);
  const skippedUsers = allUsers.filter(u => u.url?.trim() && u.weekStart !== currentWeekStart);

  if (skippedUsers.length > 0) {
    console.log(`[sync-calendar] skipping ${skippedUsers.length} users with stale weekStart (not ${currentWeekStart})`);
  }

  if (activeUsers.length === 0) {
    await recordJobMetric({ job: 'cron-sync-calendar', ok: false, message: `אין משתמשים לסינכרון השבוע (${currentWeekStart})` });
    return NextResponse.json({ ok: false, reason: 'no_active_users_this_week', currentWeekStart, skipped: skippedUsers.length });
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

  // Migrate to global_productions immediately after individual syncs
  let globalMigration: { written: number; unique: number; errors: number } | null = null;
  try {
    globalMigration = await migrateGlobalProductions();
    // Write system-wide last-sync timestamp so all users see an up-to-date "עודכן" in the widget
    await patchDocument('system/calendarSync', {
      lastSyncAt: Date.now(),
      lastSyncStatus: globalMigration.errors === 0 ? 'success' : 'partial',
    } as unknown as Record<string, string>).catch(() => {});
    await recordJobMetric({
      job: 'cron-sync-global-productions',
      ok: globalMigration.errors === 0,
      message: `סנכרון הפקות גלובאלי: ${globalMigration.written}/${globalMigration.unique} נכתבו`,
      detail: globalMigration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-calendar] global migration failed:', msg);
    await recordJobMetric({
      job: 'cron-sync-global-productions',
      ok: false,
      message: `שגיאה בסנכרון גלובאלי: ${msg.slice(0, 200)}`,
    });
  }

  return NextResponse.json({ ok: true, users: activeUsers.length, success: successCount, productions: totalProductions, elapsed, results, globalMigration });
}
