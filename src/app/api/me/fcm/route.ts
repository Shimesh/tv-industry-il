import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import {
  normalizeWebPushSubscription,
  uniqueWebPushSubscriptions,
  type StoredWebPushSubscription,
} from '@/lib/server/notifications';

export const runtime = 'nodejs';

type UserPushRegistration = {
  fcmTokens?: string[];
  webPushSubscriptions?: StoredWebPushSubscription[];
};

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let token = '';
  let webPushSubscription: StoredWebPushSubscription | null = null;
  try {
    const body = (await request.json()) as {
      token?: unknown;
      webPushSubscription?: unknown;
    };
    token = typeof body.token === 'string' ? body.token.trim() : '';
    webPushSubscription = normalizeWebPushSubscription(body.webPushSubscription);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!token && !webPushSubscription) {
    return NextResponse.json({ error: 'Missing push registration' }, { status: 400 });
  }

  const userDoc = await getDocument<UserPushRegistration>(`users/${authUser.uid}`);
  const patch: Record<string, string[] | StoredWebPushSubscription[] | boolean> = {
    notificationsEnabled: true,
  };

  if (token) {
    const existing = Array.isArray(userDoc?.fcmTokens) ? userDoc.fcmTokens : [];
    if (!existing.includes(token)) {
      patch.fcmTokens = [...existing, token];
    }
  }

  if (webPushSubscription) {
    const existing = Array.isArray(userDoc?.webPushSubscriptions) ? userDoc.webPushSubscriptions : [];
    const subscriptions = uniqueWebPushSubscriptions([...existing, webPushSubscription]);
    patch.webPushSubscriptions = subscriptions;
  }

  await patchDocument(`users/${authUser.uid}`, patch);

  return NextResponse.json({ success: true });
}
