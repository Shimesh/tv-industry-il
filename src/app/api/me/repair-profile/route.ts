import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';
import { loadAndRepairSessionProfile } from '@/lib/server/sessionBootstrap';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const { profile, repaired } = await loadAndRepairSessionProfile(authUser);
    await recordRouteMetric({ route: '/api/me/repair-profile', ok: true, statusCode: 200 });

    if (repaired) {
      await recordSystemEvent({
        type: 'profile_repaired',
        level: 'success',
        source: 'repair-profile',
        message: `בוצע repair יזום לפרופיל ${authUser.uid}`,
      });
    }

    return NextResponse.json({ success: true, repaired, profile });
  } catch (error) {
    await recordRouteMetric({ route: '/api/me/repair-profile', ok: false, statusCode: 500, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to repair profile' },
      { status: 500 },
    );
  }
}
