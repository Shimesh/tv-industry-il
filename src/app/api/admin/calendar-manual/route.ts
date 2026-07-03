import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { deleteDocument, getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchHerzliyaProductions } from '@/lib/server/herzliyaSync';
import { parseHerzliyaPopupHtml, parseScheduleHTML } from '@/lib/productionScheduleParser';
import { mergeGlobalProduction, toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay, getWeekId, type Production } from '@/lib/productionDiff';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ManualProduction = Pick<Production, 'name' | 'date' | 'studio' | 'startTime' | 'endTime'>;
type ImportBundle = { scheduleHtml?: string; departmentHtml?: string; popupHtmlById?: Record<string, string> };

function validTime(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value) && Number(value.split(':')[0]) <= 29;
}

function extractUrl(value: string): string {
  return value.match(/https?:\/\/hsil\.acc\.co\.il:5443\/[^\s<]+/i)?.[0] || '';
}

function parseBundle(input: string): { productions: Production[]; workerName: string; source: string } {
  let bundle: ImportBundle = { scheduleHtml: input };
  if (input.trim().startsWith('{')) {
    try { bundle = JSON.parse(input) as ImportBundle; } catch { /* raw HTML below */ }
  }
  const parsed = parseScheduleHTML(bundle.scheduleHtml || '', bundle.departmentHtml || '');
  const popupHtmlById = bundle.popupHtmlById || {};
  const productions = parsed.productions.map((production) => {
    const popup = production.herzliyaId ? popupHtmlById[String(production.herzliyaId)] : '';
    if (!popup) return production;
    const crew = parseHerzliyaPopupHtml(popup).map((member) => ({
      ...member, roleDetail: '', phone: member.phone || null,
    }));
    return { ...production, crew, crewSource: 'popup', popupParsed: true } as Production;
  });
  return { productions, workerName: parsed.workerName, source: Object.keys(popupHtmlById).length ? 'html-bundle' : 'html' };
}

async function removeManualFallbacks(targetUid: string, weekIds: Set<string>) {
  for (const weekId of weekIds) {
    const docs = await listDocuments<Production & { source?: string }>(`productions/${targetUid}/weeks/${weekId}/productions`).catch(() => []);
    await Promise.all(docs.filter((doc) => doc.source === 'manual-admin' && doc.id).map((doc) => deleteDocument(`productions/${targetUid}/weeks/${weekId}/productions/${doc.id}`)));
  }
}

async function saveProductions(targetUid: string, adminUid: string, productions: Production[], source: string) {
  const now = new Date().toISOString();
  const weekIds = new Set(productions.map((production) => getWeekId(production.date)));
  await removeManualFallbacks(targetUid, weekIds);
  let personal = 0;
  let global = 0;
  for (const production of productions) {
    if (!production.id || !production.name || !production.date) continue;
    const normalized: Production = { ...production, day: production.day || getHebrewDay(production.date), status: production.status || 'scheduled', crew: production.crew || [], lastUpdatedBy: adminUid, lastUpdatedAt: now };
    const globalDoc = toGlobalProduction(normalized, adminUid, `manual-import/${getWeekId(production.date)}`);
    const existing = await getDocument<GlobalProductionDoc>(`global_productions/${globalDoc.id}`).catch(() => null);
    await patchDocument(`global_productions/${globalDoc.id}`, mergeGlobalProduction(existing, globalDoc) as unknown as Record<string, string>);
    global++;
    if (production.isCurrentUserShift === false) continue;
    await patchDocument(`productions/${targetUid}/weeks/${getWeekId(production.date)}/productions/${production.id}`, {
      ...normalized, isCurrentUserShift: true, missingCandidate: false, source: `manual-${source}`,
    } as unknown as Record<string, string>);
    personal++;
  }
  return { personal, global };
}

export async function POST(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;
  const body = (await request.json()) as { targetUid?: string; productions?: ManualProduction[]; input?: string };
  const targetUid = String(body.targetUid || '').trim();
  if (!targetUid) return NextResponse.json({ error: 'יש לבחור משתמש' }, { status: 400 });

  const input = String(body.input || '').trim();
  if (input) {
    const url = extractUrl(input);
    try {
      if (url) {
        const imported = await fetchHerzliyaProductions(url);
        if (!imported.productions.length) return NextResponse.json({ error: 'לא נמצאו הפקות בקישור.' }, { status: 422 });
        const result = await saveProductions(targetUid, authUser.uid, imported.productions, 'url');
        return NextResponse.json({ ok: true, ...result, source: 'url' });
      }
      const imported = parseBundle(input);
      if (!imported.productions.length) return NextResponse.json({ error: 'לא נמצאו הפקות. יש להדביק את קוד המקור המלא של דף הלוח.' }, { status: 422 });
      const result = await saveProductions(targetUid, authUser.uid, imported.productions, imported.source);
      return NextResponse.json({ ok: true, ...result, workerName: imported.workerName || '', source: imported.source });
    } catch (error) {
      return NextResponse.json({ error: url ? 'לא ניתן לפתוח את הקישור מהשרת. הדבק את קוד המקור של דף הלוח במקום את הקישור.' : (error instanceof Error ? error.message : 'הייבוא נכשל') }, { status: 502 });
    }
  }

  const rows = Array.isArray(body.productions) ? body.productions : [];
  if (!rows.length || rows.length > 100) return NextResponse.json({ error: 'יש להוסיף לפחות הפקה אחת' }, { status: 400 });
  const productions: Production[] = rows.map((row) => {
    const name = String(row.name || '').trim(); const date = String(row.date || '').trim(); const studio = String(row.studio || '').trim(); const startTime = String(row.startTime || '').trim(); const endTime = String(row.endTime || '').trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTime(startTime) || !validTime(endTime)) throw new Error(`שורה לא תקינה: ${name || date || 'ללא שם'}`);
    return { id: `manual-${generateProductionId(name, date, studio, startTime)}`, name, date, day: getHebrewDay(date), studio, startTime, endTime, status: 'scheduled', crew: [], isCurrentUserShift: true };
  });
  const result = await saveProductions(targetUid, authUser.uid, productions, 'rows');
  return NextResponse.json({ ok: true, ...result, source: 'rows' });
}
