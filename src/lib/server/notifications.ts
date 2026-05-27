import { createDocument, getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { getFirebaseAdminMessaging } from '@/lib/server/firebaseAdmin';
import { getPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import webPush from 'web-push';

type RawUserForNotification = {
  id: string;
  siteRole?: string | null;
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
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
  type?: string;
};

export type StoredWebPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type SendWebPushParams = {
  subscriptions: StoredWebPushSubscription[];
  title: string;
  body: string;
  linkUrl?: string;
  type?: string;
};

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export function normalizeWebPushSubscription(value: unknown): StoredWebPushSubscription | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim() : '';
  const keys = record.keys && typeof record.keys === 'object'
    ? record.keys as Record<string, unknown>
    : {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  const expirationTime = typeof record.expirationTime === 'number' ? record.expirationTime : null;

  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

export function uniqueWebPushSubscriptions(values: unknown[]): StoredWebPushSubscription[] {
  const unique = new Map<string, StoredWebPushSubscription>();
  for (const value of values) {
    const subscription = normalizeWebPushSubscription(value);
    if (subscription) unique.set(subscription.endpoint, subscription);
  }
  return Array.from(unique.values());
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

const STALE_FCM_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendFcmPush(params: SendFcmPushParams): Promise<{ failedTokens: string[] }> {
  const tokens = uniqueStrings(params.tokens);
  if (tokens.length === 0) return { failedTokens: [] };

  const messaging = getFirebaseAdminMessaging();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
  const linkUrl = cleanInternalLink(params.linkUrl) || '/';
  const link = `${appUrl}${linkUrl}`;
  const failedTokens: string[] = [];

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      data: {
        source: 'firebase',
        title: params.title,
        body: params.body,
        link,
        linkUrl,
        type: params.type || 'general',
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link },
      },
    });

    response.responses.forEach((result, idx) => {
      if (!result.success && result.error && STALE_FCM_ERRORS.has(result.error.code)) {
        failedTokens.push(chunk[idx]);
      }
    });
  }

  return { failedTokens };
}

export async function removeFcmTokensFromUsers(staleTokens: string[]): Promise<void> {
  if (staleTokens.length === 0) return;
  const staleSet = new Set(staleTokens);
  try {
    const users = await listDocuments<{ id: string; fcmTokens?: unknown }>('users');
    await Promise.all(
      users
        .filter((u) => Array.isArray(u.fcmTokens) && (u.fcmTokens as string[]).some((t) => staleSet.has(t)))
        .map((u) => {
          const cleaned = (u.fcmTokens as string[]).filter((t) => !staleSet.has(t));
          return patchDocument(`users/${u.id}`, { fcmTokens: cleaned as unknown[] });
        }),
    );
  } catch (err) {
    console.error('[notifications] failed to remove stale FCM tokens:', err);
  }
}

let webPushConfigured = false;

function configureWebPush(): boolean {
  if (webPushConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;

  const subject =
    process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ||
    process.env.WEB_PUSH_CONTACT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://tv-industry-il.vercel.app';

  webPush.setVapidDetails(subject.startsWith('mailto:') || subject.startsWith('http') ? subject : `mailto:${subject}`, publicKey, privateKey);
  webPushConfigured = true;
  return true;
}

export async function sendStandardWebPush(params: SendWebPushParams) {
  const subscriptions = uniqueWebPushSubscriptions(params.subscriptions);
  if (subscriptions.length === 0) return;
  if (!configureWebPush()) {
    console.warn('[notifications] WEB_PUSH_VAPID_PRIVATE_KEY / NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY not configured; skipping standard Web Push.');
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
  const linkUrl = cleanInternalLink(params.linkUrl) || '/';
  const link = `${appUrl}${linkUrl}`;
  const payload = JSON.stringify({
    data: {
      title: params.title,
      body: params.body,
      link,
      linkUrl,
      type: params.type || 'general',
    },
  });

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 24,
        urgency: 'high',
      }),
    ),
  );
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
    const webPushByUid = new Map(adminUsers.map((user) => [user.id, user.webPushSubscriptions]));
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
      const { failedTokens } = await sendFcmPush({
        tokens: fcmTokens,
        title: 'New User Waiting',
        body: `New User Waiting: ${params.displayLabel} is requesting access to TV Industry IL.`,
        linkUrl,
      });
      if (failedTokens.length > 0) void removeFcmTokensFromUsers(failedTokens);
    }

    const subscriptions = uniqueWebPushSubscriptions(
      adminUids
        .filter((uid) => {
          const value = tokenByUid.get(uid);
          return !Array.isArray(value) || value.length === 0;
        })
        .flatMap((uid) => {
          const value = webPushByUid.get(uid);
          return Array.isArray(value) ? value : [];
        }),
    );
    if (subscriptions.length > 0) {
      await sendStandardWebPush({
        subscriptions,
        title: 'New User Waiting',
        body: `New User Waiting: ${params.displayLabel} is requesting access to TV Industry IL.`,
        linkUrl,
      });
    }
  } catch (error) {
    console.error('[notifications] failed to notify admins about pending user:', error);
  }
}
