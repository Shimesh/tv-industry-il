import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
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

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const body = await request.json().catch(() => ({})) as { simulatePhone?: string; weekStart?: string };
  const simulatePhone = body.simulatePhone ? normalizePhone(body.simulatePhone) : null;

  const currentWeekStart = getCurrentWeekStartIsrael();
  const previousWeekStart = getPreviousWeekStart(currentWeekStart);
  const targetWeek = body.weekStart || currentWeekStart;

  const allUsers = await listDocuments<UserCalendarSyncDoc>('user_calendar_sync').catch(() => []);
  const eligibleWeekStarts = new Set([currentWeekStart, previousWeekStart]);
  const activeUsers = allUsers.filter(u => u.url?.trim() && eligibleWeekStarts.has(u.weekStart));

  if (activeUsers.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no_active_users', targetWeek });
  }

  const startedAt = Date.now();
  const userResults: Array<{
    uid: string;
    workerName: string;
    status: string;
    productionCount?: number;
    error?: string;
    productions?: Array<{ id: string; name: string; date: string; crewCount: number }>;
  }> = [];

  // Step 1: Fetch and parse all users' Herzliya schedules (in-memory, no Firestore writes).
  // Key = production ID (herzliyaId as string), value = GlobalProductionDoc accumulated in memory.
  const freshProductionMap = new Map<string, GlobalProductionDoc>();

  for (const user of activeUsers) {
    const uid = (user as Record<string, unknown>).id as string || user.uid;
    const url = user.url.trim();

    try {
      new URL(url);
    } catch {
      userResults.push({ uid, workerName: user.workerName || uid, status: 'invalid_url' });
      continue;
    }

    try {
      const { productions, debug } = await fetchHerzliyaProductions(url);

      if (productions.length === 0) {
        userResults.push({ uid, workerName: user.workerName || uid, status: 'empty' });
        continue;
      }

      const prodSummary: Array<{ id: string; name: string; date: string; crewCount: number }> = [];

      for (const prod of productions) {
        if (!prod.id || !prod.date || !prod.name) continue;
        const doc = toGlobalProduction(prod, uid, 'rebuild');

        // Union in-memory across all users: start fresh (no old Firestore data)
        const existing = freshProductionMap.get(prod.id) ?? null;
        const merged = mergeGlobalProduction(existing, doc);
        freshProductionMap.set(prod.id, merged);

        prodSummary.push({ id: prod.id, name: prod.name, date: prod.date, crewCount: prod.crew?.length ?? 0 });
      }

      userResults.push({
        uid,
        workerName: user.workerName || uid,
        status: 'parsed',
        productionCount: productions.length,
        productions: prodSummary,
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      userResults.push({ uid, workerName: user.workerName || uid, status: 'error', error: errorMsg.slice(0, 200) });
    }
  }

  // Step 2: Write each production to Firestore with REPLACE semantics.
  // freshProductionMap was built without reading old Firestore data, so it contains
  // only what the current Herzliya schedules show — no accumulated stale crew.
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
          sourceWeekPath: 'rebuild',
        };
        await patchDocument(
          `global_productions/${id}`,
          enriched as unknown as Record<string, string>,
        );
        writtenCount++;
      } catch (err) {
        writeErrors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Step 3: Simulate what a specific user (by phone) would see after rebuild.
  let simulation: null | {
    phone: string;
    matchedProductions: Array<{
      id: string;
      name: string;
      date: string;
      studio: string;
      startTime: string;
      endTime: string;
      crewCount: number;
      crew: Array<{ name: string; role: string; phone: string | null; startTime: string; endTime: string }>;
    }>;
  } = null;

  if (simulatePhone) {
    const matched: Array<{
      id: string; name: string; date: string; studio: string;
      startTime: string; endTime: string; crewCount: number;
      crew: Array<{ name: string; role: string; phone: string | null; startTime: string; endTime: string }>;
    }> = [];
    for (const doc of freshProductionMap.values()) {
      const hasPhone = (doc.crew_phones ?? []).includes(simulatePhone);
      if (hasPhone) {
        matched.push({
          id: doc.id,
          name: doc.name,
          date: doc.date,
          studio: doc.studio,
          startTime: doc.startTime,
          endTime: doc.endTime,
          crewCount: doc.crew_list.length,
          crew: doc.crew_list.map(e => ({
            name: e.name,
            role: e.profession,
            phone: e.phone_number,
            startTime: e.startTime,
            endTime: e.endTime,
          })),
        });
      }
    }
    matched.sort((a, b) => a.date.localeCompare(b.date));
    simulation = { phone: simulatePhone, matchedProductions: matched };
  }

  // Background: sync contacts after rebuild
  void syncContactsFromSavedProductions(true).catch(() => {});

  const elapsed = Date.now() - startedAt;
  const parsedCount = userResults.filter(r => r.status === 'parsed').length;
  const errorCount = userResults.filter(r => r.status === 'error').length;

  return NextResponse.json({
    ok: true,
    targetWeek,
    users: {
      total: activeUsers.length,
      parsed: parsedCount,
      errors: errorCount,
    },
    productions: {
      unique: freshProductionMap.size,
      written: writtenCount,
      writeErrors: writeErrors.slice(0, 20),
    },
    elapsed,
    userResults,
    simulation,
  });
}
