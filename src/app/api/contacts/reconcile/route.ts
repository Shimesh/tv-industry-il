import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { syncContactsFromProductions } from '@/lib/server/contactsSync';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type ReconcileProductionPayload = {
  id?: string;
  crew?: Array<{
    name?: string;
    role?: string;
    roleDetail?: string;
    phone?: string | null;
    normalizedName?: string;
    normalizedPhone?: string | null;
    identityKey?: string;
  }>;
};

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as { productions?: ReconcileProductionPayload[] };
    const productions = Array.isArray(body.productions) ? body.productions : [];

    if (productions.length === 0) {
      await recordRouteMetric({
        route: '/api/contacts/reconcile',
        ok: false,
        statusCode: 400,
        error: 'No productions payload provided',
      });
      return NextResponse.json({ error: 'No productions payload provided' }, { status: 400 });
    }

    const result = await syncContactsFromProductions(productions, true);
    await Promise.all([
      recordRouteMetric({ route: '/api/contacts/reconcile', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'contacts-reconcile',
        ok: true,
        message: 'ריקלונסיל אנשי קשר מהפקות הושלם בהצלחה',
        detail: result,
      }),
    ]);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({
        route: '/api/contacts/reconcile',
        ok: false,
        statusCode: 500,
        error,
      }),
      recordJobMetric({
        job: 'contacts-reconcile',
        ok: false,
        message: 'ריקלונסיל אנשי קשר מהפקות נכשל',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reconcile contacts',
      },
      { status: 500 },
    );
  }
}
