import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runQuery, getDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type NotificationDoc = {
  id: string;
  userId?: string;
  recipientUid?: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: number;
};

type UserDoc = {
  id: string;
  email?: string;
  crewName?: string;
  displayName?: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? '';
  const message = searchParams.get('message') ?? '';
  const sentAt = searchParams.get('sentAt') ?? '';

  if (!title || !message) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const sentAtMs = sentAt ? new Date(sentAt).getTime() : Date.now();
  const windowStart = sentAtMs - 15_000;
  const windowEnd = sentAtMs + 60_000;

  try {
    const notifications = await runQuery<NotificationDoc>({
      from: [{ collectionId: 'notifications' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'title' },
                op: 'EQUAL',
                value: { stringValue: title },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'message' },
                op: 'EQUAL',
                value: { stringValue: message },
              },
            },
          ],
        },
      },
      limit: 500,
    });

    const filtered = notifications.filter((n) => {
      const ts = n.createdAt ?? 0;
      return ts >= windowStart && ts <= windowEnd;
    });

    const userIds = Array.from(new Set(filtered.map((n) => n.userId ?? n.recipientUid ?? '').filter(Boolean)));

    const userDocs = await Promise.all(
      userIds.map((uid) => getDocument<UserDoc>(`users/${uid}`)),
    );
    const userMap = new Map<string, UserDoc>();
    for (const u of userDocs) {
      if (u) userMap.set(u.id, u);
    }

    const recipients = filtered.map((n) => {
      const uid = n.userId ?? n.recipientUid ?? '';
      const user = userMap.get(uid);
      return {
        userId: uid,
        email: user?.email ?? '',
        name: user?.crewName ?? user?.displayName ?? user?.email ?? uid,
        read: n.read === true,
      };
    });

    recipients.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return (a.name ?? '').localeCompare(b.name ?? '', 'he');
    });

    return NextResponse.json({ recipients });
  } catch (err) {
    console.error('[push-recipients] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
