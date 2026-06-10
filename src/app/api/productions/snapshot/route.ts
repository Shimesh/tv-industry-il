import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { Production } from '@/lib/productionDiff';
import type { GlobalProductionDoc } from '@/lib/globalProductions';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SnapshotRequest = {
  action?: 'capture' | 'applied';
  runId?: string;
  weekId?: string;
  productions?: Production[];
  source?: string;
};

function snapshotEntryId(uid: string, productionId: string): string {
  return `${uid}_${productionId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 1400);
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let body: SnapshotRequest;
  try {
    body = await request.json() as SnapshotRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body.action === 'applied') {
    const runId = body.runId || '';
    const snapshot = await getDocument<{ userId?: string }>(`calendar_sync_snapshots/${runId}`);
    if (!snapshot || snapshot.userId !== authUser.uid) {
      return NextResponse.json({ error: 'snapshot_not_found' }, { status: 404 });
    }
    await patchDocument(`calendar_sync_snapshots/${runId}`, {
      status: 'applied',
      appliedAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, runId });
  }

  const weekId = body.weekId || '';
  const incoming = Array.isArray(body.productions) ? body.productions : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekId)) {
    return NextResponse.json({ error: 'invalid_week_id' }, { status: 400 });
  }

  const personalPath = `productions/${authUser.uid}/weeks/${weekId}/productions`;
  const existingPersonal = await listDocuments<Production>(personalPath).catch(() => []);
  const incomingById = new Map(incoming.filter((production) => production.id).map((production) => [production.id, production]));
  const personalById = new Map(existingPersonal.filter((production) => production.id).map((production) => [production.id, production]));
  const productionIds = new Set([...personalById.keys(), ...incomingById.keys()]);

  const runId = `${Date.now()}-${authUser.uid.slice(0, 10)}-manual`;
  await patchDocument(`calendar_sync_snapshots/${runId}`, {
    runId,
    userId: authUser.uid,
    weekId,
    source: body.source || 'manual-import',
    createdAt: new Date().toISOString(),
    status: 'captured',
    existingPersonalCount: personalById.size,
    incomingCount: incomingById.size,
  });

  for (const productionId of productionIds) {
    const beforeGlobal = await getDocument<GlobalProductionDoc>(`global_productions/${productionId}`).catch(() => null);
    await patchDocument(
      `calendar_sync_snapshots/${runId}/entries/${snapshotEntryId(authUser.uid, productionId)}`,
      {
        productionId,
        restorePersonal: true,
        beforePersonal: personalById.get(productionId) || null,
        beforeGlobal,
        incoming: incomingById.get(productionId) || null,
      } as unknown as Record<string, string>,
    );
  }

  return NextResponse.json({
    success: true,
    runId,
    existingPersonalCount: personalById.size,
    incomingCount: incomingById.size,
  });
}
