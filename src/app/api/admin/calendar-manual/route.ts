import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { deleteDocument, getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchHerzliyaProductions } from '@/lib/server/herzliyaSync';
import { extractDateFromPopup, extractNameFromPopup, extractStudioFromPopup, parseHerzliyaPopupHtml, parseScheduleHTML } from '@/lib/productionScheduleParser';
import { mergeGlobalProduction, toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { canonicalProductionName, generateProductionId, getHebrewDay, getWeekId, type Production } from '@/lib/productionDiff';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ManualProduction = Pick<Production, 'name' | 'date' | 'studio' | 'startTime' | 'endTime'>;
type ImportBundle = { scheduleHtml?: string; departmentHtml?: string; popupHtmlById?: Record<string, string> };
type ProductionWithCrewSource = Production & { crewSource?: string; popupParsed?: boolean };

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
    const stableProduction = production.herzliyaId ? { ...production, id: String(production.herzliyaId) } : production;
    const popup = production.herzliyaId ? popupHtmlById[String(production.herzliyaId)] : '';
    if (!popup) return stableProduction;
    const crew = parseHerzliyaPopupHtml(popup).map((member) => ({
      ...member, roleDetail: '', phone: member.phone || null,
    }));
    return { ...stableProduction, crew, crewSource: 'popup', popupParsed: true } as Production;
  });
  return { productions, workerName: parsed.workerName, source: Object.keys(popupHtmlById).length ? 'html-bundle' : 'html' };
}

function validateParsedProductions(productions: Production[]): string | null {
  if (!productions.length) return 'לא נמצאו הפקות בקוד שהודבק';
  const generic = productions.filter((production) => !production.name.trim() || production.name.trim() === 'הפקה');
  if (generic.length > 0) return 'הקוד לא זוהה כלוח הרצליה מלא: נמצאו הפקות ללא שם. שום נתון לא נשמר.';
  const invalidDates = productions.filter((production) => !/^\d{4}-\d{2}-\d{2}$/.test(production.date || ''));
  if (invalidDates.length > 0) return 'נמצאו הפקות ללא תאריך תקין. שום נתון לא נשמר.';
  return null;
}

function isIncompleteHerzliyaCrewImport(productions: Production[]): boolean {
  const realHerzliyaProductions = productions.filter((production) => {
    const herzliyaId = production.herzliyaId || (/^\d+$/.test(String(production.id || '')) ? Number(production.id) : 0);
    return Boolean(herzliyaId);
  });
  if (realHerzliyaProductions.length === 0) return false;

  return realHerzliyaProductions.every((production) => {
    const hasPopupCrew = (production as ProductionWithCrewSource).crewSource === 'popup'
      || (production as ProductionWithCrewSource).popupParsed === true;
    return !hasPopupCrew || (production.crew || []).length === 0;
  });
}

function incompleteCrewMessage(): string {
  return 'נמצאו הפקות מהרצליה, אבל לא נקרא אף צוות מ-ShowCrew. השמירה נחסמה כדי לא ליצור שבוע בלי צוותים. נסה שוב מרשת שמצליחה לפתוח את הרצליה או הדבק HTML של פופאפי הצוותים.';
}

async function productionFromPopup(targetUid: string, html: string): Promise<Production | null> {
  const date = extractDateFromPopup(html);
  const name = extractNameFromPopup(html);
  const studio = extractStudioFromPopup(html);
  const crew = parseHerzliyaPopupHtml(html).map((member) => ({ ...member, roleDetail: '', phone: member.phone || null }));
  if (!date || !name || crew.length === 0) return null;
  const docs = await listDocuments<Production>(`productions/${targetUid}/weeks/${getWeekId(date)}/productions`).catch(() => []);
  const canonicalName = canonicalProductionName(name);
  const existing = docs.find((production) => production.date === date && canonicalProductionName(production.name) === canonicalName)
    || docs.find((production) => production.date === date && (canonicalProductionName(production.name).includes(canonicalName) || canonicalName.includes(canonicalProductionName(production.name))));
  if (!existing) return null;
  return { ...existing, name, studio: studio || existing.studio, crew, isCurrentUserShift: true, crewSource: 'popup', popupParsed: true } as Production;
}

async function productionsFromPopupInput(targetUid: string, html: string): Promise<Production[]> {
  const starts = [...html.matchAll(/<div[^>]*class=["'][^"']*\bmodal-body\b[^"']*["'][^>]*>/gi)].map((match) => match.index || 0);
  const blocks = starts.length > 1
    ? starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length))
    : [html];
  const parsed = await Promise.all(blocks.map((block) => productionFromPopup(targetUid, block)));
  const byId = new Map(parsed.filter((production): production is Production => Boolean(production)).map((production) => [production.id, production]));
  return [...byId.values()];
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
    const mergedGlobal = mergeGlobalProduction(existing, globalDoc);
    await patchDocument(`global_productions/${globalDoc.id}`, mergedGlobal as unknown as Record<string, string>);
    global++;
    if (production.isCurrentUserShift === false) continue;
    const personalPath = `productions/${targetUid}/weeks/${getWeekId(production.date)}/productions/${production.id}`;
    const existingPersonal = await getDocument<ProductionWithCrewSource>(personalPath).catch(() => null);
    const hasAuthoritativeIncomingCrew = (production as ProductionWithCrewSource).crewSource === 'popup'
      || (production as ProductionWithCrewSource).popupParsed === true;
    const preservedCrew = mergedGlobal.crewSource === 'popup' && mergedGlobal.crew_list.length > 0
      ? mergedGlobal.crew_list.map((member) => ({
          name: member.name,
          role: member.profession || member.role || '',
          roleDetail: member.profession || member.role || '',
          phone: member.phone_number || member.phone || null,
          startTime: member.startTime || '',
          endTime: member.endTime || '',
        }))
      : existingPersonal?.crew || [];
    const personalCrew = hasAuthoritativeIncomingCrew || preservedCrew.length === 0
      ? normalized.crew
      : preservedCrew;
    const personalCrewSource = hasAuthoritativeIncomingCrew || (mergedGlobal.crewSource === 'popup' && preservedCrew.length > 0)
      ? 'popup'
      : existingPersonal?.crewSource;
    await patchDocument(`productions/${targetUid}/weeks/${getWeekId(production.date)}/productions/${production.id}`, {
      ...normalized,
      crew: personalCrew,
      ...(personalCrewSource ? { crewSource: personalCrewSource } : {}),
      isCurrentUserShift: true,
      missingCandidate: false,
      source: `manual-${source}`,
    } as unknown as Record<string, string>);
    personal++;
  }
  return { personal, global };
}

export async function POST(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;
  const body = (await request.json()) as { targetUid?: string; productions?: ManualProduction[]; parsedProductions?: Production[]; input?: string; preview?: boolean };
  const targetUid = String(body.targetUid || '').trim();
  if (!targetUid) return NextResponse.json({ error: 'יש לבחור משתמש' }, { status: 400 });

  const input = String(body.input || '').trim();
  if (input) {
    const url = extractUrl(input);
    try {
      if (!url && /<td[^>]*>\s*נייד\s*<\/td>/i.test(input)) {
        const popupProductions = await productionsFromPopupInput(targetUid, input);
        if (!popupProductions.length) return NextResponse.json({ error: 'נמצאו טבלאות צוות, אך לא נמצאו הפקות תואמות לפי השם והתאריך.' }, { status: 422 });
        if (body.preview) return NextResponse.json({ ok: true, preview: popupProductions, source: 'popup-html' });
        const result = await saveProductions(targetUid, authUser.uid, popupProductions, 'popup-html');
        return NextResponse.json({ ok: true, ...result, source: 'popup-html' });
      }
      if (url) {
        const imported = await fetchHerzliyaProductions(url);
        const validationError = validateParsedProductions(imported.productions);
        if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });
        const incompleteCrew = isIncompleteHerzliyaCrewImport(imported.productions);
        if (body.preview) {
          return NextResponse.json({
            ok: true,
            preview: imported.productions,
            source: 'url',
            incompleteCrew,
            warning: incompleteCrew ? incompleteCrewMessage() : undefined,
          });
        }
        if (incompleteCrew) return NextResponse.json({ error: incompleteCrewMessage() }, { status: 422 });
        const result = await saveProductions(targetUid, authUser.uid, imported.productions, 'url');
        return NextResponse.json({ ok: true, ...result, source: 'url' });
      }
      const imported = parseBundle(input);
      const validationError = validateParsedProductions(imported.productions);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });
      const incompleteCrew = isIncompleteHerzliyaCrewImport(imported.productions);
      if (body.preview) {
        return NextResponse.json({
          ok: true,
          preview: imported.productions,
          source: imported.source,
          workerName: imported.workerName || '',
          incompleteCrew,
          warning: incompleteCrew ? incompleteCrewMessage() : undefined,
        });
      }
      if (incompleteCrew) return NextResponse.json({ error: incompleteCrewMessage() }, { status: 422 });
      const result = await saveProductions(targetUid, authUser.uid, imported.productions, imported.source);
      return NextResponse.json({ ok: true, ...result, workerName: imported.workerName || '', source: imported.source });
    } catch (error) {
      return NextResponse.json({ error: url ? 'לא ניתן לפתוח את הקישור מהשרת. הדבק את קוד המקור של דף הלוח במקום את הקישור.' : (error instanceof Error ? error.message : 'הייבוא נכשל') }, { status: 502 });
    }
  }

  if (Array.isArray(body.parsedProductions)) {
    const validationError = validateParsedProductions(body.parsedProductions);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });
    if (isIncompleteHerzliyaCrewImport(body.parsedProductions)) {
      return NextResponse.json({ error: incompleteCrewMessage() }, { status: 422 });
    }
    const result = await saveProductions(targetUid, authUser.uid, body.parsedProductions, 'html-preview');
    return NextResponse.json({ ok: true, ...result, source: 'html-preview' });
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
