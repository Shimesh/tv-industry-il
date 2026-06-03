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

type RawUserForAnnounce = {
  id: string;
  siteRole?: string | null;
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
};

export type AnnounceResult =
  | { status: 'skipped'; reason: 'already-announced'; firestoreVersion: string }
  | { status: 'announced'; version: string; admins: number; fcmTokens: number; webPushSubs: number }
  | { status: 'error'; error: string };

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

export async function checkAndAnnounceVersion(): Promise<AnnounceResult> {
  try {
    const doc = await getDocument<{ version: string }>('system/appVersion');
    const firestoreVersion = doc?.version ?? '(none)';

    if (firestoreVersion === APP_VERSION) {
      console.log(`[version] Already on ${APP_VERSION} — skipping`);
      return { status: 'skipped', reason: 'already-announced', firestoreVersion };
    }

    console.log(`[version] New version detected: Firestore=${firestoreVersion} → App=${APP_VERSION}`);

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

    const webPushSubs: StoredWebPushSubscription[] = uniqueWebPushSubscriptions(
      adminUids.flatMap((uid) => {
        const v = webPushByUid.get(uid);
        return Array.isArray(v) ? v : [];
      }),
    );

    console.log(`[version] ${APP_VERSION} → admins: ${adminUids.length}, fcm: ${fcmTokens.length}, webpush: ${webPushSubs.length}`);

    if (fcmTokens.length > 0) {
      const { failedTokens } = await sendFcmPush({ tokens: fcmTokens, title, body: message, linkUrl });
      console.log(`[version] FCM sent to ${fcmTokens.length} tokens, ${failedTokens.length} failed`);
      if (failedTokens.length > 0) void removeFcmTokensFromUsers(failedTokens);
    } else {
      console.warn('[version] No FCM tokens — FCM push skipped');
    }

    if (webPushSubs.length > 0) {
      await sendStandardWebPush({ subscriptions: webPushSubs, title, body: message, linkUrl });
      console.log(`[version] Web push sent to ${webPushSubs.length} subscriptions`);
    } else {
      console.warn('[version] No web push subscriptions — web push skipped');
    }

    return { status: 'announced', version: APP_VERSION, admins: adminUids.length, fcmTokens: fcmTokens.length, webPushSubs: webPushSubs.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[version] announce failed:', err);
    return { status: 'error', error };
  }
}
