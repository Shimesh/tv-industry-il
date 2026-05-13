import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { createUserNotification, sendFcmPush } from '@/lib/server/notifications';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  email?: string;
  crewName?: string;
  fcmTokens?: string[];
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

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing notification title or message' }, { status: 400 });
    }

    if (body.linkUrl && !linkUrl) {
      return NextResponse.json({ error: 'Notification link must be an internal app path' }, { status: 400 });
    }

    let recipients: string[] = [];
    let fcmTokens: string[] = [];

    if (target === 'test') {
      recipients = [authUser.uid];
      if (sendPush) {
        const adminDoc = await getDocument<RawUser>(`users/${authUser.uid}`);
        fcmTokens = Array.isArray(adminDoc?.fcmTokens) ? adminDoc.fcmTokens : [];
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
      }
    } else if (target === 'incomplete_profile') {
      const users = await listDocuments<RawUser>('users');
      const filtered = users.filter((u) => !u.crewName || String(u.crewName).trim() === '');
      recipients = filtered.map((u) => u.id).filter(Boolean);
      if (sendPush) {
        fcmTokens = filtered.flatMap((u) => (Array.isArray(u.fcmTokens) ? u.fcmTokens : [])).filter(Boolean);
      }
    } else {
      // 'all'
      const users = await listDocuments<RawUser>('users');
      recipients = users.map((u) => u.id).filter(Boolean);
      if (sendPush) {
        fcmTokens = users.flatMap((u) => (Array.isArray(u.fcmTokens) ? u.fcmTokens : [])).filter(Boolean);
      }
    }

    await Promise.all(
      recipients.map((userId) =>
        createUserNotification({
          userId,
          title,
          message,
          linkUrl,
          type: 'general',
          source: 'admin',
          createdBy: authUser.uid,
        }),
      ),
    );

    if (sendPush && fcmTokens.length > 0) {
      await sendFcmPush({ tokens: fcmTokens, title, body: message, linkUrl });
    }

    await recordRouteMetric({ route: '/api/admin/notifications', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true, sent: recipients.length, pushTokens: sendPush ? fcmTokens.length : 0 });
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
