import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, type UserCalendarSyncDoc } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/calendar/resync
 * Re-runs Herzliya sync for the calling user using their stored URL + credentials.
 * Used by the "רענן" button in the productions page so users can pull fresh data
 * without going through the admin rebuild flow.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const userSyncPath = `user_calendar_sync/${authUser.uid}`;
  const syncDoc = await getDocument<UserCalendarSyncDoc>(userSyncPath);

  if (!syncDoc?.url?.trim()) {
    return NextResponse.json({ ok: false, reason: 'no_url' }, { status: 200 });
  }

  const url = syncDoc.url.trim();
  const userRaw = syncDoc as unknown as Record<string, unknown>;
  const storedCookie = userRaw.sessionCookie as string | undefined;
  const storedUser = userRaw.herzliyaUser as string | undefined;
  const storedPass = userRaw.herzliyaPass as string | undefined;
  const workerName = syncDoc.workerName || undefined;

  try {
    const result = await syncHerzliyaUrl(
      authUser.uid,
      url,
      storedCookie || undefined,
      storedUser || undefined,
      storedPass || undefined,
      workerName,
    );

    const statusPatch: Partial<UserCalendarSyncDoc> = {
      lastSyncAt: Date.now(),
      lastSyncStatus: result.status,
      lastSyncCount: result.status === 'success' ? result.count : 0,
      lastSyncError: result.status === 'error' ? result.error : null,
    };
    await patchDocument(userSyncPath, statusPatch as unknown as Record<string, string>).catch(() => {});

    if (result.status === 'success') {
      const names = (result.studios ?? []).map(s => s.name).filter(Boolean);
      return NextResponse.json({ ok: true, count: result.count, names, debug: result.debug });
    }
    return NextResponse.json({
      ok: false,
      reason: result.status === 'empty' ? 'empty_schedule' : 'sync_error',
      debug: (result as { debug?: string }).debug,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await patchDocument(userSyncPath, {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: errorMsg.slice(0, 300),
    } as unknown as Record<string, string>).catch(() => {});
    return NextResponse.json({ ok: false, reason: 'sync_error', error: errorMsg });
  }
}
