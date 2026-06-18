import { NextRequest, NextResponse } from 'next/server';
import { getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { normalizePhone } from '@/lib/crewNormalization';
import { getCurrentWeekStartIsrael } from '@/lib/server/herzliyaSync';
import type { GlobalProductionDoc } from '@/lib/globalProductions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-time admin utility: remove a user's phone from all global_productions crew_phones
// for the current week. Their NEXT normal sync will re-add them only to productions
// where they are genuinely scheduled (personalHerzliyaIds will protect those).
//
// Usage: GET /api/admin/disown-user?uid=<UID>&secret=<ADMIN_SECRET>
// Optional: &phone=0XXXXXXXXX to override phone lookup

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const overridePhone = req.nextUrl.searchParams.get('phone') || '';

  const phones = new Set<string>();
  if (overridePhone) {
    const p = normalizePhone(overridePhone);
    if (p) phones.add(p);
  }

  // Collect all phones for this user
  const profile = await getDocument<{ phone?: string; normalizedPhone?: string; phoneNumber?: string }>(`users/${uid}`).catch(() => null);
  for (const raw of [profile?.phone, profile?.normalizedPhone, profile?.phoneNumber]) {
    if (raw) { const p = normalizePhone(raw); if (p) phones.add(p); }
  }
  const profileDoc = await getDocument<{ phone?: string; normalizedPhone?: string }>(`profiles/${uid}`).catch(() => null);
  for (const raw of [profileDoc?.phone, profileDoc?.normalizedPhone]) {
    if (raw) { const p = normalizePhone(raw); if (p) phones.add(p); }
  }

  if (phones.size === 0) {
    return NextResponse.json({ error: 'no phone found for user', uid }, { status: 404 });
  }

  // Compute week range
  const weekStart = getCurrentWeekStartIsrael();
  const weekEndDate = new Date(`${weekStart}T12:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = weekEndDate.toISOString().split('T')[0];

  const removed: string[] = [];
  const errors: string[] = [];

  for (const phone of phones) {
    type PhoneDoc = GlobalProductionDoc & { _path?: string };
    const staleDocs = await runQuery<PhoneDoc>({
      from: [{ collectionId: 'global_productions' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'crew_phones' }, op: 'ARRAY_CONTAINS', value: { stringValue: phone } } },
            { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: weekStart } } },
            { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: weekEnd } } },
          ],
        },
      },
      limit: 200,
    }).catch(() => [] as PhoneDoc[]);

    for (const doc of staleDocs) {
      const docId = String(doc._path || '').split('/').pop() || '';
      if (!docId) continue;
      const updatedPhones = (doc.crew_phones ?? []).filter(p => !phones.has(p));
      const updatedCrew = (doc.crew_list ?? []).filter(
        (m) => !phones.has((m as unknown as { normalizedPhone?: string }).normalizedPhone ?? ''),
      );
      try {
        await patchDocument(`global_productions/${docId}`, {
          crew_phones: updatedPhones,
          crew_list: updatedCrew,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: `admin-disown:${uid}`,
        } as unknown as Record<string, string>);
        removed.push(`${doc.name} (${doc.date}) [${docId}]`);
      } catch (e) {
        errors.push(`${docId}: ${String(e).slice(0, 80)}`);
      }
    }
  }

  return NextResponse.json({
    uid,
    phones: [...phones],
    weekStart,
    weekEnd,
    removed,
    errors,
    removedCount: removed.length,
  });
}
