import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { listDocuments } from '@/lib/server/firestoreAdminRest';
import type { Production } from '@/lib/productionDiff';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const weekId = request.nextUrl.searchParams.get('weekId');
  if (!weekId || !/^\d{4}-\d{2}-\d{2}$/.test(weekId)) {
    return NextResponse.json({ error: 'weekId required (YYYY-MM-DD)' }, { status: 400 });
  }

  const path = `productions/${authUser.uid}/weeks/${weekId}/productions`;
  const docs = await listDocuments<Production>(path).catch(() => []);

  return NextResponse.json({ productions: docs });
}
