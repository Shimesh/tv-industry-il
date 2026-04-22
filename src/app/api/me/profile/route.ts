import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { loadAndRepairSessionProfile } from '@/lib/server/sessionBootstrap';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const { profile, repaired } = await loadAndRepairSessionProfile(authUser);
    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });

    return NextResponse.json({
      profile,
      source: 'server',
      repaired,
    });
  } catch (error) {
    console.error('[api/me/profile] failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedKeys = [
      'displayName',
      'department',
      'role',
      'phone',
      'bio',
      'city',
      'yearsOfExperience',
      'skills',
      'credits',
      'gear',
      'preferredRoles',
      'preferredRegions',
      'openToWork',
      'notificationsEnabled',
      'soundEnabled',
      'showPhone',
      'photoURL',
      'linkedContactId',
      'onboardingComplete',
      'crewName',
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in body) {
        patch[key] = body[key];
      }
    }
    patch.updatedAt = new Date().toISOString();

    await patchDocument(`users/${authUser.uid}`, patch as Record<string, string | boolean | number | null | string[]>);
    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/me/profile] patch failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
