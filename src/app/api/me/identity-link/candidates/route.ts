import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { findIdentityCandidates, getVerifiedNormalizedPhone } from '@/lib/server/identityLink';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    const verifiedPhone = getVerifiedNormalizedPhone(authUser);
    const candidates = await findIdentityCandidates(authUser);
    await recordRouteMetric({ route: '/api/me/identity-link/candidates', ok: true, statusCode: 200 });
    return NextResponse.json({
      verifiedPhone,
      candidates,
      primaryCandidate: candidates[0] || null,
    });
  } catch (error) {
    await recordRouteMetric({ route: '/api/me/identity-link/candidates', ok: false, statusCode: 500, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load identity candidates' },
      { status: 500 },
    );
  }
}

