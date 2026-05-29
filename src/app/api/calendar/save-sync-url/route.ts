import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { parseScheduleHTML } from '@/lib/productionScheduleParser';
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay } from '@/lib/productionDiff';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let url: string;
  let workerName: string | undefined;
  try {
    const body = (await request.json()) as { url?: string; workerName?: string };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!url) return NextResponse.json({ error: 'missing_url' }, { status: 400 });

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  // Save URL via admin — bypasses Firestore security rules
  await patchDocument('system/calendarSync', {
    url,
    workerName: workerName || '',
    savedAt: Date.now(),
    savedByUid: authUser.uid,
  } as unknown as Record<string, string>);

  // Run sync inline so lastSyncAt is set immediately
  try {
    const fetchOptions: RequestInit = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      // @ts-expect-error - Node.js 20 experimental option
      rejectUnauthorized: false,
    };

    const deptUrl = new URL(url);
    deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');

    const [personalResponse, deptResult] = await Promise.all([
      fetch(url, fetchOptions),
      fetch(deptUrl.toString(), fetchOptions).catch(() => null),
    ]);

    if (personalResponse.ok) {
      const personalHtml = await personalResponse.text();
      const deptHtml = deptResult?.ok ? await deptResult.text() : '';
      const deptSameAsPersonal = deptHtml === personalHtml;
      const parsed = parseScheduleHTML(personalHtml, deptSameAsPersonal ? '' : deptHtml);
      // Log crew counts per production for debugging
      if (parsed.productions.length > 0) {
        console.log('[save-sync-url] parsed', parsed.productions.length, 'productions, deptHtml:', deptHtml ? `${deptHtml.length} chars` : 'empty', deptSameAsPersonal ? '(same as personal)' : '');
        for (const p of parsed.productions) {
          console.log(`  [crew] ${p.name} ${p.date}: ${p.crew.length} members`);
        }
      }

      if (parsed.productions.length > 0) {
        const productions = parsed.productions.map((prod) => ({
          ...prod,
          id: prod.id || generateProductionId(prod.name, prod.date, prod.studio),
          day: prod.day || getHebrewDay(prod.date),
        }));

        await Promise.allSettled(
          productions.map((prod) => {
            const doc: GlobalProductionDoc = toGlobalProduction(prod, authUser.uid, 'api/calendar/save-sync-url');
            return patchDocument(`global_productions/${doc.id}`, doc as unknown as Record<string, string>);
          }),
        );

        void syncContactsFromSavedProductions(true).catch(() => {});

        await patchDocument('system/calendarSync', {
          lastSyncAt: Date.now(),
          lastSyncStatus: 'success',
          lastSyncCount: productions.length,
          lastSyncError: null,
        } as unknown as Record<string, string>);

        return NextResponse.json({ ok: true, synced: true, count: productions.length });
      }
    }

    // URL saved but sync yielded nothing (URL valid but no productions returned yet)
    await patchDocument('system/calendarSync', {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'empty',
      lastSyncCount: 0,
      lastSyncError: null,
    } as unknown as Record<string, string>);

    return NextResponse.json({ ok: true, synced: false, reason: 'empty_schedule' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // URL was saved; sync failed — not fatal
    await patchDocument('system/calendarSync', {
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: errorMsg.slice(0, 300),
    } as unknown as Record<string, string>).catch(() => {});

    return NextResponse.json({ ok: true, synced: false, reason: 'sync_error', error: errorMsg });
  }
}
