import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, patchDocument, runQuery, deleteDocument } from '@/lib/server/firestoreAdminRest';
import {
  fetchHerzliyaProductions,
  getCurrentWeekStartIsrael,
  getPreviousWeekStart,
  type UserCalendarSyncDoc,
} from '@/lib/server/herzliyaSync';
import { toGlobalProduction, mergeGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { normalizePhone } from '@/lib/crewNormalization';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { getHebrewDay } from '@/lib/productionDiff';
import type { Production } from '@/lib/productionDiff';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RawPersonalDoc = Record<string, unknown> & {
  id?: string;
  date?: string;
  name?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  _path?: string;
  crew?: unknown[];
};

/**
 * Rebuild global_productions from all personal-schedule docs in Firestore.
 * Unlike migrateGlobalProductions (which takes only the most-recent per ID),
 * this unions crew from ALL users for the same production ID.
 */
async function rebuildFromPersonalSchedules(
  weekStart: string,
  weekEnd: string,
): Promise<{ productionMap: Map<string, GlobalProductionDoc>; docsScanned: number; usersFound: Set<string> }> {
  const allDocs = await runQuery<RawPersonalDoc>({
    from: [{ collectionId: 'productions', allDescendants: true }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
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
        ],
      },
    },
    limit: 5000,
  });

  const filtered = allDocs.filter((doc) => {
    const path = String(doc._path || '');
    return path.includes('/weeks/') && !!doc.name && !!doc.date && Array.isArray(doc.crew);
  });

  const productionMap = new Map<string, GlobalProductionDoc>();
  const usersFound = new Set<string>();

  for (const raw of filtered) {
    const prod = raw as unknown as Production;
    if (!prod.id || !prod.date || !prod.name) continue;

    const path = String(raw._path || '');
    const parts = path.split('/');
    const weeksIdx = parts.indexOf('weeks');
    const sourcePath = weeksIdx >= 0 ? parts.slice(0, weeksIdx + 2).join('/') : path;

    // Extract uid from path: productions/{uid}/weeks/...
    const uid = parts[1] || (raw.lastUpdatedBy as string) || 'unknown';
    usersFound.add(uid);

    const enriched: Production = {
      ...prod,
      day: prod.day || getHebrewDay(prod.date),
    };

    const doc = toGlobalProduction(enriched, uid, sourcePath);

    // Union crew from all users for the same production ID
    const existing = productionMap.get(prod.id) ?? null;
    const merged = mergeGlobalProduction(existing, doc);
    productionMap.set(prod.id, merged);
  }

  return { productionMap, docsScanned: filtered.length, usersFound };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
  // Accept CRON_SECRET (for automated/server calls) or primary-admin Firebase token
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const adminSyncSecret = process.env.ADMIN_SYNC_SECRET;

  const isCronAuth =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (adminSyncSecret && authHeader === `Bearer ${adminSyncSecret}`);

  if (!isCronAuth) {
    const adminOrError = await requirePrimaryAdminRequest(request);
    if (adminOrError instanceof NextResponse) return adminOrError;
  }

  const body = await request.json().catch(() => ({})) as { simulatePhone?: string; weekStart?: string; forcePersonal?: boolean };
  const simulatePhone = body.simulatePhone ? normalizePhone(body.simulatePhone) : null;

  const currentWeekStart = getCurrentWeekStartIsrael();
  const previousWeekStart = getPreviousWeekStart(currentWeekStart);
  // Cover both current and previous week so productions spanning the boundary are included
  const weekStart = body.weekStart || previousWeekStart;
  const weekEnd = body.weekStart
    ? new Date(new Date(`${body.weekStart}T12:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : new Date(new Date(`${currentWeekStart}T12:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const startedAt = Date.now();

  // ── Step 1: Try Herzliya URLs ────────────────────────────────────────────
  const allUsers = await listDocuments<UserCalendarSyncDoc>('user_calendar_sync').catch(() => []);
  // Try ALL users with any URL — don't restrict by weekStart, since a URL stored
  // weeks ago may still be valid (especially for salaried employees like Shagiv).
  const activeUsers = allUsers.filter(u => u.url?.trim());

  const herzliyaResults: Array<{
    uid: string;
    workerName: string;
    status: string;
    productionCount?: number;
    error?: string;
  }> = [];

  const freshProductionMap = new Map<string, GlobalProductionDoc>();
  let dataSource = 'herzliya';

  if (!body.forcePersonal) {
    for (const user of activeUsers) {
      const uid = (user as Record<string, unknown>).id as string || user.uid;
      const url = user.url.trim();

      try { new URL(url); } catch {
        herzliyaResults.push({ uid, workerName: user.workerName || uid, status: 'invalid_url' });
        continue;
      }

      try {
        const storedCookie = (user as Record<string, unknown>).sessionCookie as string | undefined;
        const { productions, debug } = await fetchHerzliyaProductions(url, storedCookie || undefined);

        if (productions.length === 0) {
          herzliyaResults.push({ uid, workerName: user.workerName || uid, status: 'empty', error: debug?.slice(0, 2000) });
          continue;
        }

        for (const prod of productions) {
          if (!prod.id || !prod.date || !prod.name) continue;
          const doc = toGlobalProduction(prod, uid, 'rebuild-herzliya');
          const existing = freshProductionMap.get(prod.id) ?? null;
          freshProductionMap.set(prod.id, mergeGlobalProduction(existing, doc));
        }

        herzliyaResults.push({ uid, workerName: user.workerName || uid, status: 'parsed', productionCount: productions.length, error: debug?.slice(0, 2000) });
      } catch (err) {
        herzliyaResults.push({ uid, workerName: user.workerName || uid, status: 'error', error: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
      }
    }
  }

  // ── Step 2: Fallback to personal schedules if Herzliya sessions are expired ──
  let personalStats: { docsScanned: number; usersFound: number } | null = null;

  if (freshProductionMap.size === 0) {
    dataSource = 'personal_schedules';
    const { productionMap, docsScanned, usersFound } = await rebuildFromPersonalSchedules(weekStart, weekEnd);
    for (const [id, doc] of productionMap) {
      freshProductionMap.set(id, doc);
    }
    personalStats = { docsScanned, usersFound: usersFound.size };
  }

  // ── Step 3: Write to Firestore (REPLACE semantics) ───────────────────────
  const writeErrors: string[] = [];
  let writtenCount = 0;
  const rebuildAt = new Date().toISOString();

  await Promise.allSettled(
    Array.from(freshProductionMap.entries()).map(async ([id, doc]) => {
      try {
        const enriched: GlobalProductionDoc = {
          ...doc,
          lastUpdatedAt: rebuildAt,
          lastUpdatedBy: 'rebuild',
          sourceWeekPath: `rebuild-${dataSource}`,
        };
        await patchDocument(`global_productions/${id}`, enriched as unknown as Record<string, string>);
        writtenCount++;
      } catch (err) {
        writeErrors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // ── Step 4: Delete stale "הפקה" productions not in current rebuild ──────
  let deletedGeneric = 0;
  const deleteErrors: string[] = [];
  try {
    type GenericDoc = { id?: string; name?: string; _path?: string };
    const genericDocs = await runQuery<GenericDoc>({
      from: [{ collectionId: 'global_productions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'name' },
          op: 'EQUAL',
          value: { stringValue: 'הפקה' },
        },
      },
      limit: 200,
    });
    await Promise.allSettled(
      genericDocs.map(async (doc) => {
        const docId = doc.id || String(doc._path || '').split('/').pop();
        if (!docId || freshProductionMap.has(docId)) return;
        try {
          await deleteDocument(`global_productions/${docId}`);
          deletedGeneric++;
        } catch (err) {
          deleteErrors.push(`${docId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  } catch { /* non-critical — log only */ }

  // ── Step 5: Simulate a user's view (optional) ────────────────────────────
  type SimCrewEntry = { name: string; role: string; phone: string | null; startTime: string; endTime: string };
  type SimProduction = { id: string; name: string; date: string; studio: string; startTime: string; endTime: string; crewCount: number; crew: SimCrewEntry[] };
  let simulation: null | { phone: string; matchedProductions: SimProduction[] } = null;

  if (simulatePhone) {
    const matched: SimProduction[] = [];
    for (const doc of freshProductionMap.values()) {
      if ((doc.crew_phones ?? []).includes(simulatePhone)) {
        matched.push({
          id: doc.id, name: doc.name, date: doc.date, studio: doc.studio,
          startTime: doc.startTime, endTime: doc.endTime,
          crewCount: doc.crew_list.length,
          crew: doc.crew_list.map(e => ({
            name: e.name, role: e.profession, phone: e.phone_number,
            startTime: e.startTime, endTime: e.endTime,
          })),
        });
      }
    }
    matched.sort((a, b) => a.date.localeCompare(b.date));
    simulation = { phone: simulatePhone, matchedProductions: matched };
  }

  void syncContactsFromSavedProductions(true).catch(() => {});

  const elapsed = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    dataSource,
    weekRange: { weekStart, weekEnd },
    herzliya: {
      usersTotal: activeUsers.length,
      usersParsed: herzliyaResults.filter(r => r.status === 'parsed').length,
      usersEmpty: herzliyaResults.filter(r => r.status === 'empty').length,
      usersError: herzliyaResults.filter(r => r.status === 'error').length,
      userResults: herzliyaResults,
    },
    personalSchedules: personalStats,
    productions: {
      unique: freshProductionMap.size,
      written: writtenCount,
      writeErrors: writeErrors.slice(0, 20),
      deletedGeneric,
      deleteErrors: deleteErrors.slice(0, 5),
    },
    elapsed,
    simulation,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
