import { NextRequest, NextResponse } from 'next/server';
import { unauthorizedResponse, verifyAuthToken } from '@/lib/apiAuth';
import { deleteDocument, getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type NotificationDocument = {
  id: string;
  userId?: string;
  recipientUid?: string;
  type?: string;
  title?: string;
  message?: string;
  productionId?: string;
  productionName?: string;
  linkUrl?: string | null;
  source?: 'admin' | 'system';
  createdBy?: string;
  read?: boolean;
  readAt?: number | string;
  createdAt?: number | string;
};

function isOwnedByUser(notification: NotificationDocument | null, uid: string): notification is NotificationDocument {
  return Boolean(notification && (notification.userId === uid || notification.recipientUid === uid));
}

function normalizeNotification(notification: NotificationDocument) {
  const createdAt =
    typeof notification.createdAt === 'number'
      ? notification.createdAt
      : typeof notification.createdAt === 'string'
        ? Date.parse(notification.createdAt) || 0
        : 0;
  const readAt =
    typeof notification.readAt === 'number'
      ? notification.readAt
      : typeof notification.readAt === 'string'
        ? Date.parse(notification.readAt) || undefined
        : undefined;

  return {
    id: notification.id,
    type: notification.type || 'general',
    title: notification.title || '',
    message: notification.message || '',
    productionId: notification.productionId,
    productionName: notification.productionName,
    linkUrl: notification.linkUrl || undefined,
    source: notification.source,
    createdBy: notification.createdBy,
    read: Boolean(notification.read),
    readAt,
    createdAt,
  };
}

async function queryNotificationsByField(fieldPath: 'userId' | 'recipientUid', uid: string) {
  return runQuery<NotificationDocument>({
    from: [{ collectionId: 'notifications' }],
    where: {
      fieldFilter: {
        field: { fieldPath },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    },
    limit: 200,
  });
}

async function listUserNotifications(uid: string) {
  const [byUserId, byRecipientUid] = await Promise.all([
    queryNotificationsByField('userId', uid),
    queryNotificationsByField('recipientUid', uid),
  ]);
  const unique = new Map<string, NotificationDocument>();

  for (const notification of [...byUserId, ...byRecipientUid]) {
    if (notification.id && isOwnedByUser(notification, uid)) {
      unique.set(notification.id, notification);
    }
  }

  return [...unique.values()]
    .map(normalizeNotification)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function getOwnedNotification(id: string, uid: string) {
  const notification = await getDocument<NotificationDocument>(`notifications/${id}`);
  return isOwnedByUser(notification, uid) ? notification : null;
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const notifications = await listUserNotifications(authUser.uid);
  return NextResponse.json({ notifications });
}

export async function PATCH(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; all?: unknown };

  if (body.all === true) {
    const notifications = await listUserNotifications(authUser.uid);
    const readAt = Date.now();
    await Promise.all(
      notifications
        .filter((notification) => !notification.read)
        .map((notification) => patchDocument(`notifications/${notification.id}`, { read: true, readAt })),
    );
    return NextResponse.json({ success: true, updated: notifications.filter((notification) => !notification.read).length });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
  }

  const notification = await getOwnedNotification(id, authUser.uid);
  if (!notification) {
    return NextResponse.json({ error: 'Notification was not found' }, { status: 404 });
  }

  await patchDocument(`notifications/${id}`, { read: true, readAt: Date.now() });
  return NextResponse.json({ success: true, updated: 1 });
}

export async function DELETE(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; all?: unknown };

  if (body.all === true) {
    const notifications = await listUserNotifications(authUser.uid);
    await Promise.all(notifications.map((notification) => deleteDocument(`notifications/${notification.id}`)));
    return NextResponse.json({ success: true, deleted: notifications.length });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
  }

  const notification = await getOwnedNotification(id, authUser.uid);
  if (!notification) {
    return NextResponse.json({ error: 'Notification was not found' }, { status: 404 });
  }

  await deleteDocument(`notifications/${id}`);
  return NextResponse.json({ success: true, deleted: 1 });
}
