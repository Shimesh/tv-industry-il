import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/apiAuth';
import { getDocument } from '@/lib/server/firestoreAdminRest';
import {
  sendFcmPush,
  sendStandardWebPush,
  uniqueWebPushSubscriptions,
  removeFcmTokensFromUsers,
} from '@/lib/server/notifications';

export const runtime = 'nodejs';

type CallNotifyBody = {
  callId: string;
  receiverId: string;
  callerName: string;
  callerPhoto?: string | null;
  type: 'voice' | 'video';
  actionToken?: string;
};

type RawUserDoc = {
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: CallNotifyBody;
  try {
    body = (await request.json()) as CallNotifyBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { callId, receiverId, callerName, type, actionToken } = body;
  if (!callId || !receiverId || !callerName) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Don't notify yourself
  if (authUser.uid === receiverId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const title = type === 'video' ? '📹 שיחת וידאו נכנסת' : '📞 שיחה קולית נכנסת';
  const bodyText = callerName;
  const linkUrl = '/chat';

  const extraData: Record<string, string> = {
    callId,
    notifType: 'incoming_call',
    callerName,
  };
  if (body.callerPhoto) extraData.callerPhoto = body.callerPhoto;
  if (actionToken) extraData.actionToken = actionToken;

  try {
    const userDoc = await getDocument<RawUserDoc>(`users/${receiverId}`);
    const fcmTokens = Array.isArray(userDoc?.fcmTokens) ? (userDoc.fcmTokens as string[]) : [];
    const webPushSubs = Array.isArray(userDoc?.webPushSubscriptions) ? userDoc.webPushSubscriptions : [];

    if (fcmTokens.length > 0) {
      const { failedTokens } = await sendFcmPush({
        tokens: fcmTokens,
        title,
        body: bodyText,
        linkUrl,
        type: 'incoming_call',
        extraData,
      });
      if (failedTokens.length > 0) void removeFcmTokensFromUsers(failedTokens);
    }

    const subscriptions = uniqueWebPushSubscriptions(webPushSubs);
    if (subscriptions.length > 0) {
      await sendStandardWebPush({
        subscriptions,
        title,
        body: bodyText,
        linkUrl,
        type: 'incoming_call',
        extraData,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[call/notify] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
