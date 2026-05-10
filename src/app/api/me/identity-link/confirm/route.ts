import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { confirmIdentityLink } from '@/lib/server/identityLink';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      source?: 'profiles' | 'industry_people' | 'contacts';
      candidateId?: string;
    };

    if (
      (body.source !== 'profiles' && body.source !== 'industry_people' && body.source !== 'contacts') ||
      !body.candidateId
    ) {
      return NextResponse.json({ error: 'source and candidateId are required' }, { status: 400 });
    }

    const result = await confirmIdentityLink(authUser, body.source, body.candidateId);
    await Promise.all([
      recordRouteMetric({ route: '/api/me/identity-link/confirm', ok: true, statusCode: 200 }),
      recordSystemEvent({
        type: 'identity_linked',
        level: 'success',
        source: 'identity-link',
        message: `Identity linked for ${authUser.uid} to ${body.source}/${body.candidateId}`,
      }),
    ]);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await recordRouteMetric({ route: '/api/me/identity-link/confirm', ok: false, statusCode: 500, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm identity link' },
      { status: 500 },
    );
  }
}

