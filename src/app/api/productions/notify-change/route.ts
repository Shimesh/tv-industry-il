import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument } from '@/lib/server/firestoreAdminRest';
import {
  createUserNotification,
  sendFcmPush,
  sendStandardWebPush,
  uniqueWebPushSubscriptions,
} from '@/lib/server/notifications';

function toUniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean)));
}

export const runtime = 'nodejs';

interface ChangeItem {
  type: string;
  productionName: string;
  productionDate: string;
  description: string;
}

interface NotifyChangeBody {
  changes: ChangeItem[];
  weekLabel?: string;
}

function buildPushMessage(changes: ChangeItem[]): { title: string; body: string } {
  const added = changes.filter((c) => c.type === 'ADD_PRODUCTION');
  const cancelled = changes.filter((c) => c.type === 'CANCEL_PRODUCTION');
  const timeChanges = changes.filter((c) => c.type === 'UPDATE_TIME');
  const crewChanges = changes.filter((c) => c.type === 'ADD_CREW' || c.type === 'UPDATE_CREW');

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} הפקות נוספו`);
  if (cancelled.length) parts.push(`${cancelled.length} בוטלו`);
  if (timeChanges.length) parts.push(`${timeChanges.length} שינויי שעות`);
  if (crewChanges.length) parts.push(`${crewChanges.length} שינויי צוות`);

  const title = `עדכון לוח עבודה (${changes.length} שינויים)`;
  const body = parts.length ? parts.join(' · ') : changes[0]?.description ?? 'הלוח עודכן';

  return { title, body };
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const body = (await request.json()) as NotifyChangeBody;
  const { changes = [] } = body;

  if (changes.length === 0) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const userDoc = await getDocument<{
    fcmTokens?: unknown;
    webPushSubscriptions?: unknown;
  }>(`users/${authUser.uid}`);

  const fcmTokens = toUniqueStrings(
    Array.isArray(userDoc?.fcmTokens) ? (userDoc.fcmTokens as unknown[]) : [],
  );
  const webPushSubs = uniqueWebPushSubscriptions(
    Array.isArray(userDoc?.webPushSubscriptions) ? (userDoc.webPushSubscriptions as unknown[]) : [],
  );

  const { title, body: pushBody } = buildPushMessage(changes);
  const linkUrl = '/productions';

  const [notifResult] = await Promise.allSettled([
    createUserNotification({
      userId: authUser.uid,
      title,
      message: pushBody,
      type: 'status_change',
      source: 'system',
      linkUrl,
    }),
    fcmTokens.length > 0
      ? sendFcmPush({ tokens: fcmTokens, title, body: pushBody, linkUrl, type: 'status_change' })
      : Promise.resolve({ failedTokens: [] }),
    webPushSubs.length > 0
      ? sendStandardWebPush({ subscriptions: webPushSubs, title, body: pushBody, linkUrl })
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    success: notifResult.status === 'fulfilled',
    fcmTargets: fcmTokens.length,
    webPushTargets: webPushSubs.length,
  });
}
