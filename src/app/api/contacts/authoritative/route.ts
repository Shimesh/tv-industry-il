import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { loadContactsSnapshot } from '@/lib/server/sessionBootstrap';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const snapshot = await loadContactsSnapshot();
    await recordRouteMetric({ route: '/api/contacts/authoritative', ok: true, statusCode: 200 });
    return NextResponse.json({
      contacts: snapshot.contacts,
      total: snapshot.total,
      updatedAt: snapshot.updatedAt,
      source: 'server',
    });
  } catch (error) {
    console.error('[api/contacts/authoritative] failed:', error);
    await recordRouteMetric({ route: '/api/contacts/authoritative', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
}
