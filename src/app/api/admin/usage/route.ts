import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getUsageSnapshot, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const usage = await getUsageSnapshot();
    await recordRouteMetric({ route: '/api/admin/usage', ok: true, statusCode: 200 });
    return NextResponse.json(usage);
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/usage',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load usage snapshot' },
      { status: 500 },
    );
  }
}
