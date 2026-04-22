import { NextRequest, NextResponse } from 'next/server';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import {
  loadAndRepairSessionProfile,
  loadContactsSnapshot,
  type SessionBootstrapPayload,
} from '@/lib/server/sessionBootstrap';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const [{ profile, repaired }, contactsSnapshot] = await Promise.all([
      loadAndRepairSessionProfile(authUser),
      loadContactsSnapshot().catch(() => null),
    ]);

    const payload: SessionBootstrapPayload = {
      profile,
      contactsTotal: contactsSnapshot?.total ?? null,
      contactsUpdatedAt: contactsSnapshot?.updatedAt ?? null,
      profileSource: 'server',
      contactsSource: contactsSnapshot ? 'server' : 'unavailable',
      repaired,
      generatedAt: new Date().toISOString(),
    };

    await recordRouteMetric({ route: '/api/bootstrap/session', ok: true, statusCode: 200 });
    if (repaired) {
      await recordSystemEvent({
        type: 'profile_repaired',
        level: 'success',
        source: 'bootstrap',
        message: `בוצע repair לפרופיל ${authUser.uid}`,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    await recordRouteMetric({
      route: '/api/bootstrap/session',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bootstrap session' },
      { status: 500 },
    );
  }
}
