import { createDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { getFirebaseAdminMessaging } from '@/lib/server/firebaseAdmin';
import { getPrimaryAdminUid } from '@/lib/server/primaryAdmin';

type RawUserForNotification = {
  id: string;
  siteRole?: string | null;
  fcmTokens?: unknown;
};

type CreateUserNotificationParams = {
  userId: string;
  title: string;
  message: string;
  linkUrl?: string;
  type?: string;
  source?: 'admin' | 'system';
  createdBy?: string;
};

type SendFcmPushParams = {
  tokens: string[];
  title: string;
  body: string;
  linkUrl?: string;
};

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function cleanInternalLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return undefined;
  return trimmed.slice(0, 300);
}

export async function createUserNotification(params: CreateUserNotificationParams) {
  const linkUrl = cleanInternalLink(params.linkUrl);

  await createDocument('notifications', {
    userId: params.userId,
    recipientUid: params.userId,
    type: params.type || 'general',
    title: params.title,
    message: params.message,
    linkUrl: linkUrl || null,
    source: params.source || 'system',
    createdBy: params.createdBy || 'system',
    read: false,
    createdAt: Date.now(),
  });
}

export async function sendFcmPush(params: SendFcmPushParams) {
  const tokens = uniqueStrings(params.tokens);
  if (tokens.length === 0) return;

  const messaging = getFirebaseAdminMessaging();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
  const linkUrl = cleanInternalLink(params.linkUrl) || '/';
  const link = `${appUrl}${linkUrl}`;

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    await messaging.sendEachForMulticast({
      tokens: tokens.slice(i, i + chunkSize),
      notification: { title: params.title, body: params.body },
      data: {
        title: params.title,
        body: params.body,
        link,
        linkUrl,
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link },
        notification: {
          title: params.title,
          body: params.body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: 'tv-industry-pending-user',
          renotify: true,
          data: { link },
        },
      },
    });
  }
}

export async function notifyAdminsOfPendingUser(params: {
  uid: string;
  displayLabel: string;
}) {
  try {
    const users = await listDocuments<RawUserForNotification>('users');
    const primaryAdminUid = getPrimaryAdminUid();
    const adminUsers = users.filter((user) => user.siteRole === 'admin' || user.id === primaryAdminUid);
    const adminUids = uniqueStrings([...adminUsers.map((user) => user.id), primaryAdminUid]);
    const tokenByUid = new Map(adminUsers.map((user) => [user.id, user.fcmTokens]));
    const linkUrl = `/admin/users?uid=${encodeURIComponent(params.uid)}`;
    const title = 'משתמש חדש ממתין לאישור';
    const message = `${params.displayLabel} ממתין/ה לאישור גישה`;

    await Promise.all(
      adminUids.map((userId) =>
        createUserNotification({
          userId,
          title,
          message,
          linkUrl,
          type: 'user_pending_approval',
          source: 'system',
          createdBy: 'system',
        }),
      ),
    );

    const fcmTokens = uniqueStrings(
      adminUids.flatMap((uid) => {
        const value = tokenByUid.get(uid);
        return Array.isArray(value) ? value : [];
      }),
    );

    if (fcmTokens.length > 0) {
      await sendFcmPush({
        tokens: fcmTokens,
        title: 'New User Waiting',
        body: `New User Waiting: ${params.displayLabel} is requesting access to TV Industry IL.`,
        linkUrl,
      });
    }
  } catch (error) {
    console.error('[notifications] failed to notify admins about pending user:', error);
  }
}
