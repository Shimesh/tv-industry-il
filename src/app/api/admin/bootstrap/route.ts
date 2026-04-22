import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

async function adminExists(): Promise<boolean> {
  const admins = await runQuery<{ id: string }>({
    from: [{ collectionId: 'users' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'siteRole' },
        op: 'EQUAL',
        value: { stringValue: 'admin' },
      },
    },
    limit: 1,
  });

  return admins.length > 0;
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const exists = await adminExists();
    await recordRouteMetric({ route: '/api/admin/bootstrap', ok: true, statusCode: 200 });
    return NextResponse.json({ adminExists: exists, canClaim: !exists });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/bootstrap',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check bootstrap state' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const exists = await adminExists();
    if (exists) {
      await recordRouteMetric({
        route: '/api/admin/bootstrap',
        ok: false,
        statusCode: 409,
        error: 'Admin already exists',
      });
      return NextResponse.json({ error: 'Admin already exists' }, { status: 409 });
    }

    await patchDocument(`users/${authUser.uid}`, {
      siteRole: 'admin',
      updatedAt: new Date().toISOString(),
    });
    await Promise.all([
      recordRouteMetric({ route: '/api/admin/bootstrap', ok: true, statusCode: 200 }),
      recordSystemEvent({
        type: 'bootstrap_admin_claim',
        level: 'success',
        source: 'admin',
        message: `המשתמש ${authUser.uid} קיבל גישת מנהל ראשונה`,
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/bootstrap',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim first admin' },
      { status: 500 },
    );
  }
}
