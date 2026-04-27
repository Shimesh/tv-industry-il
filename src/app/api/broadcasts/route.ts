import { NextRequest, NextResponse } from 'next/server';
import type { BroadcastsApiResponse } from '@/lib/broadcasts';
import { loadBroadcastChannels } from '@/lib/server/broadcasts';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope');
  const channelId = request.nextUrl.searchParams.get('channelId');

  try {
    const channels = await loadBroadcastChannels(scope, channelId);

    const payload: BroadcastsApiResponse = {
      scope: scope || 'all',
      serverTime: new Date().toISOString(),
      channels,
    };

    await recordRouteMetric({
      route: '/api/broadcasts',
      ok: true,
      statusCode: 200,
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/broadcasts',
      ok: false,
      statusCode: 500,
      error,
    });

    return NextResponse.json(
      {
        scope: scope || 'all',
        serverTime: new Date().toISOString(),
        channels: [],
        error: error instanceof Error ? error.message : 'Broadcasts fetch failed',
      },
      { status: 500 },
    );
  }
}
