import { NextRequest, NextResponse } from 'next/server';
import { incrementPageView, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { pathname?: string };
    const pathname = String(body.pathname || '').trim();
    if (!pathname.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
    }

    await incrementPageView(pathname);
    return NextResponse.json({ success: true });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/metrics/page-view',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to track page view' },
      { status: 500 },
    );
  }
}
