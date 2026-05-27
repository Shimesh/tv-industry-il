import packageJson from '../../../package.json';
import { getDocument, patchDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { getPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import {
  sendFcmPush,
  sendStandardWebPush,
  createUserNotification,
  removeFcmTokensFromUsers,
  uniqueWebPushSubscriptions,
  type StoredWebPushSubscription,
} from '@/lib/server/notifications';

const APP_VERSION: string = packageJson.version;

let announced = false;

type RawUserForAnnounce = {
  id: string;
  siteRole?: string | null;
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
};

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

export async function checkAndAnnounceVersion(): Promise<void> {
  if (announced) return;
  announced = true;

  try {
    const doc = await getDocument<{ version: string }>('system/appVersion');
    if (doc?.version === APP_VERSION) return;

    await patchDocument('system/appVersion', {
      version: APP_VERSION,
      deployedAt: Date.now(),
    } as Parameters<typeof patchDocument>[1]);

    const users = await listDocuments<RawUserForAnnounce>('users');
    const primaryAdminUid = getPrimaryAdminUid();
    const adminUsers = users.filter((u) => u.siteRole === 'admin' || u.id === primaryAdminUid);
    const adminUids = uniqueStrings([...adminUsers.map((u) => u.id), primaryAdminUid]);
    const tokenByUid = new Map(adminUsers.map((u) => [u.id, u.fcmTokens]));
    const webPushByUid = new Map(adminUsers.map((u) => [u.id, u.webPushSubscriptions]));

    const title = `גרסה ${APP_VERSION} עלתה לאוויר`;
    const message = `עדכון גרסה ${APP_VERSION} הופץ בהצלחה`;
    const linkUrl = '/admin';

    await Promise.all(
      adminUids.map((uid) =>
        createUserNotification({ userId: uid, title, message, linkUrl, type: 'general', source: 'system', createdBy: 'system' }),
      ),
    );

    const fcmTokens = uniqueStrings(
      adminUids.flatMap((uid) => {
        const v = tokenByUid.get(uid);
        return Array.isArray(v) ? v : [];
      }),
    );
    if (fcmTokens.length > 0) {
      const { failedTokens } = await sendFcmPush({ tokens: fcmTokens, title, body: message, linkUrl });
      if (failedTokens.length > 0) void removeFcmTokensFromUsers(failedTokens);
    }

    const webPushSubs: StoredWebPushSubscription[] = uniqueWebPushSubscriptions(
      adminUids
        .filter((uid) => {
          const v = tokenByUid.get(uid);
          return !Array.isArray(v) || v.length === 0;
        })
        .flatMap((uid) => {
          const v = webPushByUid.get(uid);
          return Array.isArray(v) ? v : [];
        }),
    );
    if (webPushSubs.length > 0) {
      await sendStandardWebPush({ subscriptions: webPushSubs, title, body: message, linkUrl });
    }
  } catch (err) {
    console.error('[version] announce failed:', err);
  }
}
