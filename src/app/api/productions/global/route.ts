import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument, runQuery, getDocument } from '@/lib/server/firestoreAdminRest';

// GlobalProductionDoc is fully JSON-serializable; cast satisfies FirestorePrimitive at runtime
function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
  return patchDocument(path, data as unknown as Record<string, string>);
}
import {
  toGlobalProduction,
  fromGlobalProduction,
  mergeGlobalProduction,
  type GlobalProductionDoc,
} from '@/lib/globalProductions';
import { splitHerzliyaRole } from '@/lib/productionScheduleParser';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';
import { getWeekId, type Production } from '@/lib/productionDiff';
import { getLinkedProductionIdentity } from '@/lib/server/identityLink';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import { hasFullCalendarAccess } from '@/lib/calendarAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ─── POST — write productions to global_productions ─────────────────────── */

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let body: { productions?: Production[]; sourceWeekPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { productions = [], sourceWeekPath = '' } = body;
  if (!Array.isArray(productions) || productions.length === 0) {
    return NextResponse.json({ success: true, count: 0, errors: [] });
  }

  const errors: string[] = [];
  let count = 0;
  const snapshotRunId = `${Date.now()}-${authUser.uid.slice(0, 10)}-global`;

  await writeDoc(`calendar_sync_snapshots/${snapshotRunId}`, {
    runId: snapshotRunId,
    userId: authUser.uid,
    source: 'global-api-write',
    createdAt: new Date().toISOString(),
    status: 'captured',
    incomingCount: productions.length,
  });

  for (const prod of productions) {
    if (!prod?.id) continue;
    const existing = await getDocument<GlobalProductionDoc>(`global_productions/${prod.id}`);
    await writeDoc(
      `calendar_sync_snapshots/${snapshotRunId}/entries/${`${authUser.uid}_${prod.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 1400)}`,
      {
        productionId: prod.id,
        restorePersonal: false,
        beforeGlobal: existing,
        incoming: prod,
      } as unknown as Record<string, unknown>,
    );
  }

  await Promise.allSettled(
    productions.map(async (prod) => {
      if (!prod?.id || !prod?.date || !prod?.name) return;
      try {
        const doc = toGlobalProduction(prod, authUser.uid, sourceWeekPath);
        const existing = await getDocument<GlobalProductionDoc>(`global_productions/${doc.id}`);
        const merged = mergeGlobalProduction(existing, doc);
        await writeDoc(`global_productions/${doc.id}`, merged as unknown as Record<string, unknown>);
        count++;
      } catch (err) {
        errors.push(`${prod.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  if (count > 0) {
    void syncContactsFromSavedProductions(true).catch((err) =>
      console.error('[api/productions/global] background sync error:', err),
    );
  }

  await writeDoc(`calendar_sync_snapshots/${snapshotRunId}`, {
    status: errors.length ? 'partial' : 'applied',
    appliedAt: new Date().toISOString(),
    writtenCount: count,
    errorCount: errors.length,
  });

  return NextResponse.json({ success: true, count, errors, snapshotRunId });
}

/* ─── GET — query global_productions by phone or shadowKey + date range ───── */

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const scope = searchParams.get('scope');
  const phone = searchParams.get('phone');
  const profileId = searchParams.get('profileId');
  const shadowKey = searchParams.get('shadowKey');
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');

  if (scope === 'weeks') {
    try {
      const docs = await runQuery<GlobalProductionDoc>({
        from: [{ collectionId: 'global_productions' }],
        limit: 1000,
      });

      const weeks = Array.from(
        docs.reduce((acc, doc) => {
          if (typeof doc.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(doc.date)) {
            acc.add(getWeekId(doc.date));
          }
          return acc;
        }, new Set<string>()),
      ).sort((a, b) => b.localeCompare(a));

      return NextResponse.json({
        success: true,
        count: weeks.length,
        weeks,
        latestWeekId: weeks[0] || null,
      });
    } catch (error) {
      console.error('[/api/productions/global GET weeks]', error);
      return NextResponse.json({ success: false, count: 0, weeks: [], latestWeekId: null });
    }
  }

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(weekStart) || !dateRe.test(weekEnd)) {
    return NextResponse.json({ error: 'Invalid date format — expected YYYY-MM-DD' }, { status: 400 });
  }

  const identity = profileId ? await getLinkedProductionIdentity(authUser) : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const queryKey = normalizedPhone || shadowKey || null;
  const userDoc = await getDocument<Record<string, unknown>>(`users/${authUser.uid}`).catch(() => null);
  const canQueryFullCalendar = hasFullCalendarAccess(userDoc);

  if (!queryKey && !profileId && !canQueryFullCalendar) {
    return NextResponse.json({ success: true, count: 0, productions: [], calendarMode: 'personal' }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' },
    });
  }

  try {
    const dateFilters = [
      {
        fieldFilter: {
          field: { fieldPath: 'date' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { stringValue: weekStart },
        },
      },
      {
        fieldFilter: {
          field: { fieldPath: 'date' },
          op: 'LESS_THAN_OR_EQUAL',
          value: { stringValue: weekEnd },
        },
      },
    ];

    const shouldFilterByLinkedProfile = Boolean(
      profileId &&
      identity &&
      (identity.profileId === profileId || identity.linkedContactId === profileId),
    );

    if (profileId && !shouldFilterByLinkedProfile) {
      return NextResponse.json({ success: true, count: 0, productions: [] });
    }

    const filters = queryKey && !shouldFilterByLinkedProfile
      ? [
          {
            fieldFilter: {
              field: { fieldPath: normalizedPhone ? 'crew_phones' : 'crew_shadow_keys' },
              op: 'ARRAY_CONTAINS',
              value: { stringValue: queryKey },
            },
          },
          ...dateFilters,
        ]
      : dateFilters;

    const docs = await runQuery<GlobalProductionDoc>({
      from: [{ collectionId: 'global_productions' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters,
        },
      },
      limit: 500,
    });

    const sourceDocs = shouldFilterByLinkedProfile
      ? docs.filter((doc) => {
          const phoneSet = new Set(identity?.phones ?? []);
          const nameSet = new Set((identity?.names ?? []).map((name) => normalizeName(name)).filter(Boolean));
          return (doc.crew_list ?? []).some((entry) => {
            const entryPhone = normalizePhone(entry.normalizedPhone || entry.phone_number || '');
            const entryName = normalizeName(entry.name || '');
            if (entryPhone && phoneSet.has(entryPhone)) return true;
            return Boolean(entryName && nameSet.has(entryName));
          });
        })
      : docs;

    // Dedup by herzliyaId+date and strip role suffix from names (cleans old Firestore entries)
    const byHerzliya = new Map<string, GlobalProductionDoc>();
    const noHerzliyaId: GlobalProductionDoc[] = [];
    for (const doc of sourceDocs) {
      if (doc.herzliyaId) {
        const key = `${doc.herzliyaId}::${doc.date}`;
        const existing = byHerzliya.get(key);
        if (!existing || doc.crew_list.length > existing.crew_list.length ||
            (doc.crew_list.length === existing.crew_list.length &&
              String(doc.lastUpdatedAt) > String(existing.lastUpdatedAt))) {
          byHerzliya.set(key, doc);
        }
      } else {
        noHerzliyaId.push(doc);
      }
    }
    const cleanDoc = (doc: GlobalProductionDoc): GlobalProductionDoc => {
      const { name } = splitHerzliyaRole(doc.name);
      return name && name !== doc.name ? { ...doc, name } : doc;
    };
    const productions = [
      ...Array.from(byHerzliya.values()).map(cleanDoc),
      ...noHerzliyaId.map(cleanDoc),
    ].map(fromGlobalProduction);
    return NextResponse.json({ success: true, count: productions.length, productions, identity }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' },
    });
  } catch (error) {
    console.error('[/api/productions/global GET]', error);
    return NextResponse.json({ success: false, count: 0, productions: [] });
  }
}

/* ─── PATCH — claim shifts: add phone to crew_list entries by shadow key ──── */

export async function PATCH(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let body: { productionIds?: string[]; crewName?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { productionIds = [], crewName = '', phone = '' } = body;
  if (!productionIds.length || !crewName || !phone) {
    return NextResponse.json({ error: 'productionIds, crewName, and phone are required' }, { status: 400 });
  }

  // Security: verify the phone matches the caller's profile phone
  const userDoc = await getDocument<{ phone?: string; normalizedPhone?: string }>(`users/${authUser.uid}`);
  const profilePhone = normalizePhone(userDoc?.phone || userDoc?.normalizedPhone || null);
  const claimPhone = normalizePhone(phone);
  if (!claimPhone || claimPhone !== profilePhone) {
    return NextResponse.json({ error: 'Phone number does not match your profile' }, { status: 403 });
  }

  const normClaimName = normalizeName(crewName);
  let claimedCount = 0;
  const errors: string[] = [];

  await Promise.allSettled(
    productionIds.map(async (prodId) => {
      try {
        const doc = await getDocument<GlobalProductionDoc>(`global_productions/${prodId}`);
        if (!doc) return;

        const crewList = (doc.crew_list ?? []).map((entry) => {
          if (normalizeName(entry.name) !== normClaimName) return entry;
          return {
            ...entry,
            phone_number: claimPhone,
            normalizedPhone: claimPhone,
            shadowKey: null,
          };
        });

        // Rebuild flat index arrays
        const phonesSet = new Set<string>(doc.crew_phones ?? []);
        phonesSet.add(claimPhone);
        const oldShadowKey = (doc.crew_shadow_keys ?? []).find((k) =>
          k.startsWith(normClaimName + '::'),
        );
        const shadowKeys = (doc.crew_shadow_keys ?? []).filter((k) => k !== oldShadowKey);

        await writeDoc(`global_productions/${prodId}`, {
          crew_list: crewList,
          crew_phones: Array.from(phonesSet),
          crew_shadow_keys: shadowKeys,
        } as unknown as Record<string, unknown>);

        claimedCount++;
      } catch (err) {
        errors.push(`${prodId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  return NextResponse.json({ success: true, claimedCount, errors });
}
