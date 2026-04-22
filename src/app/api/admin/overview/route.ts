import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getAdminOverview } from '@/lib/server/adminOverview';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const overview = await getAdminOverview();
    await recordRouteMetric({ route: '/api/admin/overview', ok: true, statusCode: 200 });
    return NextResponse.json(overview);
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/overview',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load admin overview' },
      { status: 500 },
    );
  }
}
