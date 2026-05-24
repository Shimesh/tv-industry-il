import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type UserPresenceRecord = {
  id: string;
  isOnline?: boolean;
  lastSeen?: string | number | null;
  presenceStatus?: string | null;
  activeChatId?: string | null;
};

const STALE_PRESENCE_MS = 60 * 60 * 1000;

function lastSeenMillis(value: UserPresenceRecord['lastSeen']): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function clearStalePresence() {
  const users = await listDocuments<UserPresenceRecord>('users');
  const cutoff = Date.now() - STALE_PRESENCE_MS;
  const staleUsers = users.filter((entry) =>
    entry.isOnline === true &&
    lastSeenMillis(entry.lastSeen) > 0 &&
    lastSeenMillis(entry.lastSeen) < cutoff
  );

  await Promise.all(
    staleUsers.map((entry) =>
      patchDocument(`users/${entry.id}`, {
        isOnline: false,
        presenceStatus: 'offline',
        activeChatId: null,
        updatedAt: new Date().toISOString(),
      })
    )
  );

  await recordSystemEvent({
    type: 'chat_diagnostics_fix',
    level: staleUsers.length ? 'success' : 'info',
    source: 'admin-chat-diagnostics',
    message: staleUsers.length
      ? `נוקתה נוכחות תקועה עבור ${staleUsers.length} משתמשים`
      : 'בדיקת נוכחות הושלמה ללא משתמשים תקועים',
    detail: JSON.stringify({ actionId: 'clear_stale_presence', affected: staleUsers.map((entry) => entry.id) }),
  });

  return {
    ok: true,
    actionId: 'clear_stale_presence',
    affectedCount: staleUsers.length,
    affectedUserIds: staleUsers.map((entry) => entry.id),
    message: staleUsers.length
      ? `נוקתה נוכחות תקועה עבור ${staleUsers.length} משתמשים`
      : 'לא נמצאו משתמשים עם נוכחות תקועה',
  };
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  let actionId = '';

  try {
    const body = (await request.json().catch(() => ({}))) as { actionId?: string };
    actionId = typeof body.actionId === 'string' ? body.actionId : '';

    if (actionId === 'refresh_diagnostics') {
      await recordRouteMetric({ route: '/api/admin/chat-diagnostics/actions', ok: true, statusCode: 200 });
      return NextResponse.json({
        ok: true,
        actionId,
        message: 'האבחון רוענן. לא בוצע שינוי במערכת.',
      });
    }

    if (actionId === 'clear_stale_presence') {
      const result = await clearStalePresence();
      await recordRouteMetric({ route: '/api/admin/chat-diagnostics/actions', ok: true, statusCode: 200 });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown or disallowed action' }, { status: 400 });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/chat-diagnostics/actions',
      ok: false,
      statusCode: 500,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        actionId,
        error: error instanceof Error ? error.message : 'Failed to run diagnostic action',
      },
      { status: 500 },
    );
  }
}
