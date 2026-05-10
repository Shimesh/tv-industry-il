import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { listDocuments } from '@/lib/server/firestoreAdminRest';
import type { Production } from '@/lib/productionDiff';
import { getLinkedProductionIdentity } from '@/lib/server/identityLink';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const weekId = request.nextUrl.searchParams.get('weekId');
  if (!weekId || !/^\d{4}-\d{2}-\d{2}$/.test(weekId)) {
    return NextResponse.json({ error: 'weekId required (YYYY-MM-DD)' }, { status: 400 });
  }

  const identity = await getLinkedProductionIdentity(authUser);
  const roots = Array.from(new Set([
    authUser.uid,
    ...identity.linkedUids,
    identity.profileId,
    identity.linkedContactId,
  ].filter((value): value is string => Boolean(value))));

  const docSets = await Promise.all(
    roots.map((root) => listDocuments<Production>(`productions/${root}/weeks/${weekId}/productions`).catch(() => [])),
  );

  const byId = new Map<string, Production>();
  for (const doc of docSets.flat()) {
    if (!doc?.id) continue;
    const existing = byId.get(doc.id);
    if (!existing || String(doc.lastUpdatedAt || '') > String(existing.lastUpdatedAt || '')) {
      byId.set(doc.id, doc);
    }
  }

  return NextResponse.json({ productions: Array.from(byId.values()), identity });
}
