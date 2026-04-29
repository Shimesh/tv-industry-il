import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument, runQuery, getDocument } from '@/lib/server/firestoreAdminRest';

// GlobalProductionDoc is fully JSON-serializable; cast satisfies FirestorePrimitive at runtime
function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
  return patchDocument(path, data as unknown as Record<string, string>);
}
import { toGlobalProduction, fromGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';
import type { Production } from '@/lib/productionDiff';

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

  await Promise.allSettled(
    productions.map(async (prod) => {
      if (!prod?.id || !prod?.date || !prod?.name) return;
      try {
        const doc = toGlobalProduction(prod, authUser.uid, sourceWeekPath);
        await writeDoc(`global_productions/${doc.id}`, doc as unknown as Record<string, unknown>);
        count++;
      } catch (err) {
        errors.push(`${prod.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  return NextResponse.json({ success: true, count, errors });
}

/* ─── GET — query global_productions by phone or shadowKey + date range ───── */

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const phone = searchParams.get('phone');
  const shadowKey = searchParams.get('shadowKey');
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(weekStart) || !dateRe.test(weekEnd)) {
    return NextResponse.json({ error: 'Invalid date format — expected YYYY-MM-DD' }, { status: 400 });
  }

  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const queryKey = normalizedPhone || shadowKey || null;

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

    const filters = queryKey
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

    const productions = docs.map(fromGlobalProduction);
    return NextResponse.json({ success: true, count: productions.length, productions });
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
