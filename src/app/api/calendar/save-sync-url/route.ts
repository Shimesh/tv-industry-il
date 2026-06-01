import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, getCurrentWeekStartIsrael, type UserCalendarSyncDoc } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let url: string;
  let workerName: string;
  try {
    const body = (await request.json()) as { url?: string; workerName?: string };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!url) return NextResponse.json({ error: 'missing_url' }, { status: 400 });

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const userSyncPath = `user_calendar_sync/${authUser.uid}`;

  // Save per-user URL with current week context
  await patchDocument(userSyncPath, {
    uid: authUser.uid,
    url,
    workerName,
    savedAt: Date.now(),
    weekStart: getCurrentWeekStartIsrael(),
  } as unknown as Record<string, string>);

  // Run sync immediately
  try {
    const result = await syncHerzliyaUrl(authUser.uid, url);

    const statusPatch: Partial<UserCalendarSyncDoc> = {
      lastSyncAt: Date.now(),
      lastSyncStatus: result.status,
      lastSyncCount: result.status === 'success' ? result.count : 0,
      lastSyncError: result.status === 'error' ? result.error : null,
    };
    await patchDocument(userSyncPath, statusPatch as unknown as Record<string, string>);

    if (result.status === 'success') {
      return NextResponse.json({ ok: true, synced: true, count: result.count, studios: result.studios });
    }
    return NextResponse.json({ ok: true, synced: false, reason: result.status === 'empty' ? 'empty_schedule' : 'sync_error' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await patchDocument(userSyncPath, {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: errorMsg.slice(0, 300),
    } as unknown as Record<string, string>).catch(() => {});

    return NextResponse.json({ ok: true, synced: false, reason: 'sync_error', error: errorMsg });
  }
}
