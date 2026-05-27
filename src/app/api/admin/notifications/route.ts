import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import {
  createUserNotification,
  sendFcmPush,
  sendStandardWebPush,
  removeFcmTokensFromUsers,
  uniqueWebPushSubscriptions,
  type StoredWebPushSubscription,
} from '@/lib/server/notifications';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  email?: string;
  crewName?: string;
  fcmTokens?: string[];
  webPushSubscriptions?: unknown[];
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanInternalLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return undefined;
  return trimmed.slice(0, 300);
}

function cleanNotificationType(value: unknown): string {
  if (value === 'world_cup_goal_alert' || value === 'world_cup_match_start') return value;
  return 'general';
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = cleanText(body.title, 90);
    const message = cleanText(body.message, 500);
    const target =
      body.target === 'user' || body.target === 'all' || body.target === 'incomplete_profile'
        ? body.target
        : 'test';
    const targetUserId = cleanText(body.targetUserId, 160);
    const linkUrl = cleanInternalLink(body.linkUrl);
    const sendPush = body.sendPush === true;
    const notificationType = cleanNotificationType(body.type);

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing notification title or message' }, { status: 400 });
    }

    if (body.linkUrl && !linkUrl) {
      return NextResponse.json({ error: 'Notification link must be an internal app path' }, { status: 400 });
    }

    let recipients: string[] = [];
    let fcmTokens: string[] = [];
    let webPushSubscriptions: StoredWebPushSubscription[] = [];

    if (target === 'test') {
      recipients = [authUser.uid];
      if (sendPush) {
        const adminDoc = await getDocument<RawUser>(`users/${authUser.uid}`);
        fcmTokens = Array.isArray(adminDoc?.fcmTokens) ? adminDoc.fcmTokens : [];
        webPushSubscriptions = fcmTokens.length > 0
          ? []
          : uniqueWebPushSubscriptions(adminDoc?.webPushSubscriptions ?? []);
      }
    } else if (target === 'user') {
      if (!targetUserId) {
        return NextResponse.json({ error: 'Missing target user' }, { status: 400 });
      }
      const userDoc = await getDocument<RawUser>(`users/${targetUserId}`);
      if (!userDoc) {
        return NextResponse.json({ error: 'Target user was not found' }, { status: 404 });
      }
      recipients = [targetUserId];
      if (sendPush) {
        fcmTokens = Array.isArray(userDoc.fcmTokens) ? userDoc.fcmTokens : [];
        webPushSubscriptions = fcmTokens.length > 0
          ? []
          : uniqueWebPushSubscriptions(userDoc.webPushSubscriptions ?? []);
      }
    } else if (target === 'incomplete_profile') {
      const users = await listDocuments<RawUser>('users');
      const filtered = users.filter((u) => !u.crewName || String(u.crewName).trim() === '');
      recipients = filtered.map((u) => u.id).filter(Boolean);
      if (sendPush) {
        fcmTokens = filtered.flatMap((u) => (Array.isArray(u.fcmTokens) ? u.fcmTokens : [])).filter(Boolean);
        webPushSubscriptions = uniqueWebPushSubscriptions(
          filtered
            .filter((u) => !Array.isArray(u.fcmTokens) || u.fcmTokens.length === 0)
            .flatMap((u) => (Array.isArray(u.webPushSubscriptions) ? u.webPushSubscriptions : [])),
        );
      }
    } else {
      // 'all'
      const users = await listDocuments<RawUser>('users');
      recipients = users.map((u) => u.id).filter(Boolean);
      if (sendPush) {
        fcmTokens = users.flatMap((u) => (Array.isArray(u.fcmTokens) ? u.fcmTokens : [])).filter(Boolean);
        webPushSubscriptions = uniqueWebPushSubscriptions(
          users
            .filter((u) => !Array.isArray(u.fcmTokens) || u.fcmTokens.length === 0)
            .flatMap((u) => (Array.isArray(u.webPushSubscriptions) ? u.webPushSubscriptions : [])),
        );
      }
    }

    await Promise.all(
      recipients.map((userId) =>
        createUserNotification({
          userId,
          title,
          message,
          linkUrl,
          type: notificationType,
          source: 'admin',
          createdBy: authUser.uid,
        }),
      ),
    );

    if (sendPush && fcmTokens.length > 0) {
      const { failedTokens } = await sendFcmPush({ tokens: fcmTokens, title, body: message, linkUrl, type: notificationType });
      if (failedTokens.length > 0) {
        void removeFcmTokensFromUsers(failedTokens);
      }
    }
    if (sendPush && webPushSubscriptions.length > 0) {
      await sendStandardWebPush({ subscriptions: webPushSubscriptions, title, body: message, linkUrl, type: notificationType });
    }

    await recordRouteMetric({ route: '/api/admin/notifications', ok: true, statusCode: 200 });
    return NextResponse.json({
      success: true,
      sent: recipients.length,
      pushTokens: sendPush ? fcmTokens.length + webPushSubscriptions.length : 0,
    });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/notifications',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send notification' },
      { status: 500 },
    );
  }
}
