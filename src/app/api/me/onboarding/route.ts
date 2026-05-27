import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { finalizeUserOnboardingProfile } from '@/lib/server/sessionBootstrap';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

function cleanText(value: unknown, maxLength = 160): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await finalizeUserOnboardingProfile(authUser, {
      displayName: cleanText(body.displayName),
      department: cleanText(body.department),
      role: cleanText(body.role),
      phone: cleanText(body.phone, 20),
    });

    await recordRouteMetric({ route: '/api/me/onboarding', ok: true, statusCode: 200 });
    return NextResponse.json({
      success: true,
      created: result.created,
      linkedContactId: result.linkedContactId,
      profile: result.profile,
    });
  } catch (error) {
    console.error('[api/me/onboarding] failed:', error);
    await recordRouteMetric({ route: '/api/me/onboarding', ok: false, statusCode: 500, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to finalize onboarding' },
      { status: 500 },
    );
  }
}
