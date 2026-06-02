import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/server/firestoreAdminRest';
import { verifyAuthToken } from '@/lib/apiAuth';
import {
  sendFcmPush,
  sendStandardWebPush,
  createUserNotification,
  removeFcmTokensFromUsers,
  uniqueWebPushSubscriptions,
} from '@/lib/server/notifications';

type NotifyBody = {
  chatId: string;
  senderUid: string;
  senderName: string;
  messageText?: string;
  isEncrypted?: boolean;
  memberUids: string[];
};

// Must match Socket.IO heartbeat cadence (30s × 6 beats grace)
const ONLINE_STALE_MS = 3 * 60 * 1000;

type RawUserDoc = {
  id: string;
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
  isOnline?: boolean;
  activeChatId?: string | null;
  lastSeen?: number | string | null;
};

function isRecentlyOnline(userData: RawUserDoc | null): boolean {
  if (!userData?.isOnline) return false;
  const raw = userData.lastSeen;
  const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? new Date(raw).getTime() : 0;
  return ms > 0 && Date.now() - ms <= ONLINE_STALE_MS;
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.NOTIFY_API_SECRET?.trim();
  if (secret) {
    const provided = request.headers.get('x-notify-secret')?.trim();
    if (provided !== secret) {
      // Also accept Firebase Auth token as an alternative to the server secret
      const authUser = await verifyAuthToken(request);
      if (!authUser) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }
  } else {
    // No secret configured — require Firebase Auth to prevent open abuse
    const authUser = await verifyAuthToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { chatId, senderUid, senderName, messageText, isEncrypted, memberUids } = body;
  if (!chatId || !senderUid || !Array.isArray(memberUids) || memberUids.length === 0) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const recipientUids = memberUids.filter((uid) => uid !== senderUid);
  if (recipientUids.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const title = senderName || 'הודעה חדשה';
  const bodyText = isEncrypted
    ? 'קיבלת הודעה מוצפנת חדשה'
    : (messageText || 'קיבלת הודעה חדשה').slice(0, 120);
  const linkUrl = `/chat?id=${chatId}`;

  try {
    const userDocs = await Promise.allSettled(
      recipientUids.map((uid) => getDocument<RawUserDoc>(`users/${uid}`)),
    );

    const pushFcmTokens: string[] = [];
    const pushWebPushSubs: unknown[] = [];
    const bellPromises: Promise<void>[] = [];

    for (let i = 0; i < recipientUids.length; i++) {
      const uid = recipientUids[i];
      const result = userDocs[i];
      const userData = result.status === 'fulfilled' ? result.value : null;

      // Presence check (lastSeen must be within 3 min to count as online):
      // - User is in this exact chat → skip all notifications
      // - User is online but in a different chat → bell only, no push
      // - User is offline / lastSeen stale → bell + push
      const online = isRecentlyOnline(userData);
      const isInThisChat = online && userData?.activeChatId === chatId;

      if (isInThisChat) continue;

      bellPromises.push(
        createUserNotification({
          userId: uid,
          title,
          message: bodyText,
          linkUrl,
          type: 'new_message',
          source: 'system',
          createdBy: senderUid,
        }),
      );

      if (!online) {
        const fcmTokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens as string[] : [];
        const webPushSubs = Array.isArray(userData?.webPushSubscriptions) ? userData.webPushSubscriptions : [];
        pushFcmTokens.push(...fcmTokens);
        pushWebPushSubs.push(...webPushSubs);
      }
    }

    await Promise.all(bellPromises);

    const tokens = uniqueStrings(pushFcmTokens);
    if (tokens.length > 0) {
      const { failedTokens } = await sendFcmPush({ tokens, title, body: bodyText, linkUrl, type: 'new_message' });
      if (failedTokens.length > 0) void removeFcmTokensFromUsers(failedTokens);
    }

    const webPushSubscriptions = uniqueWebPushSubscriptions(pushWebPushSubs);
    if (webPushSubscriptions.length > 0) {
      await sendStandardWebPush({ subscriptions: webPushSubscriptions, title, body: bodyText, linkUrl, type: 'new_message' });
    }

    return NextResponse.json({ ok: true, recipients: recipientUids.length });
  } catch (err) {
    console.error('[chat/notify] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
