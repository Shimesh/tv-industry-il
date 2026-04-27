import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import {
  createDocument,
  getDocument,
  runQuery,
} from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

type UserRecord = {
  id: string;
  displayName?: string;
  email?: string;
  siteRole?: string;
};

function sanitize(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const description = sanitize(body.description, 3000);
    const route = sanitize(body.route, 240);
    const action = sanitize(body.action, 600);

    if (description.length < 8) {
      return NextResponse.json({ error: 'צריך לתאר את הבאג בכמה מילים' }, { status: 400 });
    }

    const reporter = await getDocument<UserRecord>(`users/${authUser.uid}`);
    const reporterName = reporter?.displayName || authUser.displayName || authUser.email || 'משתמש';
    const reporterEmail = reporter?.email || authUser.email || '';

    const admins = await runQuery<UserRecord>({
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'siteRole' },
          op: 'EQUAL',
          value: { stringValue: 'admin' },
        },
      },
    });

    const createdAt = Date.now();
    const routeLabel = route || 'לא צוין';
    const actionLabel = action || 'לא צוין';

    await Promise.all(admins.map((admin) => (
      createDocument('notifications', {
        userId: admin.id,
        type: 'bug_report',
        title: 'דיווח באג חדש',
        message: `${reporterName} דיווח/ה על באג בעמוד ${routeLabel}`,
        bugDescription: description,
        bugRoute: routeLabel,
        bugAction: actionLabel,
        reporterUid: authUser.uid,
        reporterName,
        reporterEmail,
        read: false,
        createdAt,
      })
    )));

    await recordSystemEvent({
      type: 'bug_report',
      level: 'warn',
      source: 'user-feedback',
      message: `דיווח באג חדש מ-${reporterName}`,
      detail: JSON.stringify({
        route: routeLabel,
        action: actionLabel,
        description,
        reporterUid: authUser.uid,
        reporterEmail,
      }).slice(0, 1200),
      route: routeLabel,
    });

    await recordRouteMetric({ route: '/api/bug-report', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true });
  } catch (error) {
    await recordRouteMetric({ route: '/api/bug-report', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'שליחת הדיווח נכשלה' }, { status: 500 });
  }
}
