import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type Payload = {
  siteRole?: 'admin' | 'moderator' | 'user' | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const { uid } = await context.params;
    const body = (await request.json()) as Payload;
    const requestedRole = body.siteRole;
    const siteRole =
      requestedRole === 'admin' || requestedRole === 'moderator'
        ? requestedRole
        : null;

    await patchDocument(`users/${uid}`, {
      siteRole,
      updatedAt: new Date().toISOString(),
    });

    await recordSystemEvent({
      type: 'admin_role_change',
      level: 'success',
      source: 'admin',
      message: `הרשאת המשתמש ${uid} עודכנה ל-${siteRole || 'user'}`,
      detail: `updatedBy=${authUser.uid}`,
    });
    await recordRouteMetric({ route: '/api/admin/users/[uid]/role', ok: true, statusCode: 200 });

    return NextResponse.json({ success: true, uid, siteRole: siteRole || 'user' });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/users/[uid]/role',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update role' },
      { status: 500 },
    );
  }
}
