import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getRecentSystemEvents, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const events = await getRecentSystemEvents(25);
    await recordRouteMetric({ route: '/api/admin/system-events', ok: true, statusCode: 200 });
    return NextResponse.json({ events });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/system-events',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load system events' },
      { status: 500 },
    );
  }
}
