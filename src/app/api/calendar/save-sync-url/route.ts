import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncHerzliyaUrl, getCurrentWeekStartIsrael, type UserCalendarSyncDoc } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getWeekStartFromIsoDate(dateStr: string): string {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().split('T')[0];
}

function getWeekStartFromHerzliyaUrl(url: string): string | null {
  const match = String(url || '').match(/,(\d{2})(\d{2})(\d{4})(?:\b|$)/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return getWeekStartFromIsoDate(`${yyyy}-${mm}-${dd}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let url: string;
  let workerName: string;
  let sessionCookie: string;
  let herzliyaUser: string;
  let herzliyaPass: string;
  try {
    const body = (await request.json()) as {
      url?: string; workerName?: string; sessionCookie?: string;
      herzliyaUser?: string; herzliyaPass?: string;
    };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
    sessionCookie = typeof body.sessionCookie === 'string' ? body.sessionCookie.trim() : '';
    herzliyaUser = typeof body.herzliyaUser === 'string' ? body.herzliyaUser.trim() : '';
    herzliyaPass = typeof body.herzliyaPass === 'string' ? body.herzliyaPass.trim() : '';
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

  const syncDoc: Partial<UserCalendarSyncDoc> & { uid: string; url: string; workerName: string; savedAt: number; weekStart: string } = {
    uid: authUser.uid,
    url,
    workerName,
    savedAt: Date.now(),
    weekStart: getWeekStartFromHerzliyaUrl(url) ?? getCurrentWeekStartIsrael(),
    lastSyncStatus: 'pending',
    lastSyncRequestedAt: Date.now(),
    ...(sessionCookie ? { sessionCookie } : {}),
    ...(herzliyaUser ? { herzliyaUser } : {}),
    ...(herzliyaPass ? { herzliyaPass } : {}),
  };
  await patchDocument(userSyncPath, syncDoc as unknown as Record<string, string>);

  try {
    const result = await syncHerzliyaUrl(
      authUser.uid, url,
      sessionCookie || undefined,
      herzliyaUser || undefined,
      herzliyaPass || undefined,
      workerName || undefined,
      authUser.phoneNumber || undefined,
    );

    const statusPatch: Partial<UserCalendarSyncDoc> = {
      lastSyncAt: Date.now(),
      lastSyncStatus: result.status === 'success' ? 'success' : 'pending',
      lastSyncCount: result.status === 'success' ? result.count : 0,
      lastSyncError: result.status === 'error' ? result.error : null,
    };
    await patchDocument(userSyncPath, statusPatch as unknown as Record<string, string>);

    if (result.status === 'success') {
      if (result.finalUrl) {
        await patchDocument(userSyncPath, { url: result.finalUrl } as unknown as Record<string, string>).catch(() => {});
      }
      if (result.fullCalendarDetected) {
        await patchDocument(`users/${authUser.uid}`, {
          calendarEmploymentType: 'employee',
          calendarEmploymentDetectedAt: new Date().toISOString(),
          calendarEmploymentDetectedBy: 'herzliya-full-calendar-upload',
          calendarEmploymentDetectionPersonalCount: result.personalProductionCount ?? 0,
          calendarEmploymentDetectionDepartmentCount: result.departmentProductionCount ?? result.count,
        } as unknown as Record<string, string>).catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        synced: true,
        count: result.count,
        studios: result.studios,
        debug: result.debug,
        fullCalendarDetected: result.fullCalendarDetected === true,
        calendarEmploymentType: result.fullCalendarDetected ? 'employee' : undefined,
      });
    }
    return NextResponse.json({ ok: true, synced: false, queued: true, reason: result.status === 'empty' ? 'empty_schedule' : 'sync_error', debug: (result as { debug?: string }).debug });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await patchDocument(userSyncPath, {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'pending',
      lastSyncError: errorMsg.slice(0, 300),
    } as unknown as Record<string, string>).catch(() => {});

    return NextResponse.json({ ok: true, synced: false, queued: true, reason: 'sync_error', error: errorMsg });
  }
}
