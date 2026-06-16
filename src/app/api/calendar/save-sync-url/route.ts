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
  let sessionCookie: string;
  try {
    const body = (await request.json()) as { url?: string; workerName?: string; sessionCookie?: string };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
    sessionCookie = typeof body.sessionCookie === 'string' ? body.sessionCookie.trim() : '';
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
  const syncDoc: Partial<UserCalendarSyncDoc> & { uid: string; url: string; workerName: string; savedAt: number; weekStart: string } = {
    uid: authUser.uid,
    url,
    workerName,
    savedAt: Date.now(),
    weekStart: getCurrentWeekStartIsrael(),
    ...(sessionCookie ? { sessionCookie } : {}),
  };
  await patchDocument(userSyncPath, syncDoc as unknown as Record<string, string>);

  // Run sync immediately
  try {
    const result = await syncHerzliyaUrl(authUser.uid, url, sessionCookie || undefined);

    const statusPatch: Partial<UserCalendarSyncDoc> = {
      lastSyncAt: Date.now(),
      lastSyncStatus: result.status,
      lastSyncCount: result.status === 'success' ? result.count : 0,
      lastSyncError: result.status === 'error' ? result.error : null,
    };
    await patchDocument(userSyncPath, statusPatch as unknown as Record<string, string>);

    if (result.status === 'success') {
      // If redirect resolved to a different (stable) URL, update the saved URL so
      // the hourly GitHub Action uses it instead of the expired sendwa.html GUID URL.
      if (result.finalUrl) {
        await patchDocument(userSyncPath, { url: result.finalUrl } as unknown as Record<string, string>).catch(() => {});
      }
      return NextResponse.json({ ok: true, synced: true, count: result.count, studios: result.studios, debug: result.debug });
    }
    return NextResponse.json({ ok: true, synced: false, reason: result.status === 'empty' ? 'empty_schedule' : 'sync_error', debug: (result as { debug?: string }).debug });
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
