import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { createDocument, getDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  email?: string;
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

async function createUserNotification(params: {
  userId: string;
  title: string;
  message: string;
  linkUrl?: string;
  createdBy: string;
}) {
  await createDocument('notifications', {
    userId: params.userId,
    type: 'general',
    title: params.title,
    message: params.message,
    linkUrl: params.linkUrl || null,
    source: 'admin',
    createdBy: params.createdBy,
    read: false,
    createdAt: Date.now(),
  });
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
    const target = body.target === 'user' || body.target === 'all' ? body.target : 'test';
    const targetUserId = cleanText(body.targetUserId, 160);
    const linkUrl = cleanInternalLink(body.linkUrl);

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing notification title or message' }, { status: 400 });
    }

    if (body.linkUrl && !linkUrl) {
      return NextResponse.json({ error: 'Notification link must be an internal app path' }, { status: 400 });
    }

    let recipients: string[] = [];
    if (target === 'test') {
      recipients = [authUser.uid];
    } else if (target === 'user') {
      if (!targetUserId) {
        return NextResponse.json({ error: 'Missing target user' }, { status: 400 });
      }
      const userDoc = await getDocument<RawUser>(`users/${targetUserId}`);
      if (!userDoc) {
        return NextResponse.json({ error: 'Target user was not found' }, { status: 404 });
      }
      recipients = [targetUserId];
    } else {
      const users = await listDocuments<RawUser>('users');
      recipients = users.map((user) => user.id).filter(Boolean);
    }

    await Promise.all(
      recipients.map((userId) =>
        createUserNotification({
          userId,
          title,
          message,
          linkUrl,
          createdBy: authUser.uid,
        }),
      ),
    );

    await recordRouteMetric({ route: '/api/admin/notifications', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true, sent: recipients.length });
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
