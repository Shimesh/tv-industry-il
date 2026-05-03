import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getPageViewEvents, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  const pathname = request.nextUrl.searchParams.get('pathname')?.trim() || '';
  if (!pathname.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
  }

  try {
    const events = await getPageViewEvents(pathname, 50);
    await recordRouteMetric({ route: '/api/admin/usage/page-views', ok: true, statusCode: 200 });
    return NextResponse.json({ events });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/usage/page-views',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load page views' },
      { status: 500 },
    );
  }
}
