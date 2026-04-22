import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const result = await syncContactsFromSavedProductions(false);
    await recordRouteMetric({ route: '/api/admin/contacts-sync', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true, preview: true, ...result });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/contacts-sync',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate contacts sync preview' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const result = await syncContactsFromSavedProductions(true);
    await Promise.all([
      recordRouteMetric({ route: '/api/admin/contacts-sync', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'contacts-sync',
        ok: true,
        message: 'סנכרון אנשי הקשר הושלם בהצלחה',
        detail: result,
      }),
    ]);
    return NextResponse.json({ success: true, preview: false, ...result });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({
        route: '/api/admin/contacts-sync',
        ok: false,
        statusCode: 500,
        error,
      }),
      recordJobMetric({
        job: 'contacts-sync',
        ok: false,
        message: 'סנכרון אנשי הקשר נכשל',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync contacts' },
      { status: 500 },
    );
  }
}
