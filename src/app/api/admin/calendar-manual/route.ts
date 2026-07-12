import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { deleteDocument, getDocument, listDocuments, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { fetchHerzliyaProductions } from '@/lib/server/herzliyaSync';
import { markPersonalAssignmentsFromCrew, removeStalePersonalAssignments } from '@/lib/server/calendarPersonalAssignments';
import { extractDateFromPopup, extractNameFromPopup, extractStudioFromPopup, parseHerzliyaPopupHtml, parseScheduleHTML } from '@/lib/productionScheduleParser';
import { mergeGlobalProduction, toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { canonicalProductionName, generateProductionId, getHebrewDay, getWeekId, type Production } from '@/lib/productionDiff';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ManualProduction = Pick<Production, 'name' | 'date' | 'studio' | 'startTime' | 'endTime'>;
type ImportBundle = { scheduleHtml?: string; departmentHtml?: string; popupHtmlById?: Record<string, string> };
type ProductionWithCrewSource = Production & { crewSource?: string; popupParsed?: boolean };

const HERZLIYA_SHOWCREW_BASE = 'https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll';
const SHOWCREW_TIMEOUT_MS = 8000;
const SHOWCREW_CONCURRENCY = 5;

function validTime(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value) && Number(value.split(':')[0]) <= 29;
}

function extractUrl(value: string): string {
  return value.match(/https?:\/\/hsil\.acc\.co\.il:5443\/[^\s<]+/i)?.[0] || '';
}

function looksLikePopupCrewInput(value: string): boolean {
  const input = value.trim();
  if (!input.includes('<table') || !input.includes('<td')) return false;

  const hasPopupShell = /<div[^>]*class=["'][^"']*\bmodal-body\b/i.test(input);
  const hasHerzliyaPopupHeader =
    /<font[^>]*color=["']red["'][^>]*>\s*<b>[\s\S]*?<\/b>\s*<\/font>/i.test(input)
    && /<font[^>]*color=["']#0255b5["'][^>]*>\s*<b>\d{1,2}\/\d{1,2}\/\d{4}<\/b>\s*<\/font>/i.test(input);
  const hasCrewColumns =
    /<td[^>]*>\s*(?:שעות|time)\s*<\/td>/i.test(input)
    && /<td[^>]*>\s*(?:תפקיד|role)\s*<\/td>/i.test(input)
    && /<td[^>]*>\s*(?:שם|name)\s*<\/td>/i.test(input)
    && /<td[^>]*>\s*(?:נייד|טלפון|phone|mobile)\s*<\/td>/i.test(input);

  return hasCrewColumns && (hasPopupShell || hasHerzliyaPopupHeader);
}

function buildShowCrewUrl(herzliyaId: number): string {
  const url = new URL(HERZLIYA_SHOWCREW_BASE);
  url.searchParams.set('appname', 'HsILWeb');
  url.searchParams.set('prgname', 'ShowCrew');
  url.searchParams.set('arguments', `-N${herzliyaId}`);
  return url.toString();
}

async function fetchShowCrewPopup(herzliyaId: number, referer?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHOWCREW_TIMEOUT_MS);
  try {
    const response = await fetch(buildShowCrewUrl(herzliyaId), {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(referer ? { referer } : {}),
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ShowCrew ${herzliyaId} HTTP ${response.status}`);
    const html = await response.text();
    if (!html || html.length < 100 || !/<table/i.test(html)) throw new Error(`ShowCrew ${herzliyaId} returned empty html`);
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWithLiveShowCrew(productions: Production[], referer?: string): Promise<{ productions: Production[]; fetched: number; failed: number }> {
  let fetched = 0;
  let failed = 0;
  const enriched: Production[] = new Array(productions.length);

  async function enrichOne(production: Production, index: number): Promise<void> {
    const herzliyaId = production.herzliyaId || (/^\d+$/.test(String(production.id || '')) ? Number(production.id) : 0);
    if (!herzliyaId) {
      enriched[index] = production;
      return;
    }
    try {
      const popup = await fetchShowCrewPopup(herzliyaId, referer);
      const crew = parseHerzliyaPopupHtml(popup).map((member) => ({ ...member, roleDetail: '', phone: member.phone || null }));
      if (crew.length === 0) throw new Error(`ShowCrew ${herzliyaId} parsed zero crew`);
      fetched++;
      enriched[index] = {
        ...production,
        id: String(herzliyaId),
        herzliyaId,
        name: extractNameFromPopup(popup) || production.name,
        studio: extractStudioFromPopup(popup) || production.studio,
        date: extractDateFromPopup(popup) || production.date,
        day: getHebrewDay(extractDateFromPopup(popup) || production.date),
        crew,
        crewSource: 'popup',
        popupParsed: true,
      } as Production;
    } catch {
      failed++;
      enriched[index] = production;
    }
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(SHOWCREW_CONCURRENCY, productions.length) }, async () => {
    while (cursor < productions.length) {
      const index = cursor++;
      await enrichOne(productions[index], index);
    }
  });
  await Promise.all(workers);

  return { productions: enriched, fetched, failed };
}

async function parseBundle(input: string, referer?: string): Promise<{ productions: Production[]; workerName: string; source: string; popupFetched?: number; popupFailed?: number }> {
  let bundle: ImportBundle = { scheduleHtml: input };
  if (input.trim().startsWith('{')) {
    try { bundle = JSON.parse(input) as ImportBundle; } catch { /* raw HTML below */ }
  }
  const parsed = parseScheduleHTML(bundle.scheduleHtml || '', bundle.departmentHtml || '');
  const popupHtmlById = bundle.popupHtmlById || {};
  const hasPopupBundle = Object.keys(popupHtmlById).length > 0;
  const productions = parsed.productions.map((production) => {
    const stableProduction = production.herzliyaId ? { ...production, id: String(production.herzliyaId) } : production;
    const popup = production.herzliyaId ? popupHtmlById[String(production.herzliyaId)] : '';
    if (!popup) {
      const hasDepartmentCrew = (stableProduction.crew || []).length > 0;
      return hasDepartmentCrew
        ? { ...stableProduction, crewSource: 'department', departmentEnriched: true } as Production
        : stableProduction;
    }
    const crew = parseHerzliyaPopupHtml(popup).map((member) => ({
      ...member, roleDetail: '', phone: member.phone || null,
    }));
    return { ...stableProduction, crew, crewSource: 'popup', popupParsed: true } as Production;
  });
  const hasDepartmentCrew = productions.some((production) => (production.crew || []).length > 0 && (production as ProductionWithCrewSource).crewSource !== 'popup');
  if (!hasPopupBundle && parsed.productions.some((production) => production.herzliyaId || /^\d+$/.test(String(production.id || '')))) {
    const live = await enrichWithLiveShowCrew(productions, referer);
    const liveHasPopup = live.productions.some((production) => (production as ProductionWithCrewSource).crewSource === 'popup');
    const liveHasDepartmentCrew = live.productions.some((production) => (production.crew || []).length > 0 && (production as ProductionWithCrewSource).crewSource !== 'popup');
    return {
      productions: live.productions,
      workerName: parsed.workerName,
      source: liveHasPopup ? 'html-showcrew-live' : liveHasDepartmentCrew ? 'department-html' : 'html',
      popupFetched: live.fetched,
      popupFailed: live.failed,
    };
  }
  return { productions, workerName: parsed.workerName, source: hasPopupBundle ? 'html-bundle' : hasDepartmentCrew ? 'department-html' : 'html', popupFetched: 0, popupFailed: 0 };
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
    const hasUsableDepartmentCrew = (production.crew || []).length > 0;
    return (!hasPopupCrew || (production.crew || []).length === 0) && !hasUsableDepartmentCrew;
  });
}

function hasDepartmentOnlyCrew(productions: Production[]): boolean {
  return productions.some((production) => (
    (production.crew || []).length > 0
    && (production as ProductionWithCrewSource).crewSource !== 'popup'
    && (production as ProductionWithCrewSource).popupParsed !== true
  ));
}

function departmentOnlyCrewMessage(): string {
  return 'נמצא יומן מחלקתי מלא מ-ShowEmp6. השרת ניסה להשלים פופאפי ShowCrew; פופאפים שלא נשלפו לא ידרסו צוות מלא קיים.';
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
  const canonicalName = canonicalProductionName(name);
  const [globalDocs, personalDocs] = await Promise.all([
    runQuery<GlobalProductionDoc>({
      from: [{ collectionId: 'global_productions' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } },
      limit: 100,
    }).catch(() => []),
    listDocuments<Production>(`productions/${targetUid}/weeks/${getWeekId(date)}/productions`).catch(() => []),
  ]);

  const matchesName = (productionName: string) => {
    const candidate = canonicalProductionName(productionName);
    return candidate === canonicalName || candidate.includes(canonicalName) || canonicalName.includes(candidate);
  };
  const existingGlobal = globalDocs.find((production) => matchesName(production.name || ''));
  const existingPersonal = personalDocs.find((production) => production.date === date && matchesName(production.name || ''));
  const existing = existingGlobal || existingPersonal;
  if (!existing) return null;

  return {
    id: String(existing.id),
    herzliyaId: existing.herzliyaId,
    name,
    studio: studio || existing.studio || '',
    date,
    day: getHebrewDay(date),
    startTime: crew[0]?.endTime || existing.startTime || '',
    endTime: crew[0]?.startTime || existing.endTime || '',
    status: 'scheduled',
    crew,
    isCurrentUserShift: existingPersonal?.isCurrentUserShift === true,
    crewSource: 'popup',
    popupParsed: true,
  } as Production;
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
  const marked = await markPersonalAssignmentsFromCrew(targetUid, productions);
  const resolvedProductions = marked.identityAvailable ? marked.productions : productions;
  const weekIds = new Set(productions.map((production) => getWeekId(production.date)));
  await removeManualFallbacks(targetUid, weekIds);
  let personal = 0;
  let global = 0;
  for (const production of resolvedProductions) {
    if (!production.id || !production.name || !production.date) continue;
    const normalized: Production = { ...production, day: production.day || getHebrewDay(production.date), status: production.status || 'scheduled', crew: production.crew || [], lastUpdatedBy: adminUid, lastUpdatedAt: now };
    const globalDoc = toGlobalProduction(normalized, adminUid, `manual-import/${getWeekId(production.date)}`);
    const existing = await getDocument<GlobalProductionDoc>(`global_productions/${globalDoc.id}`).catch(() => null);
    const mergedGlobal = mergeGlobalProduction(existing, globalDoc);
    await patchDocument(`global_productions/${globalDoc.id}`, mergedGlobal as unknown as Record<string, string>);
    global++;
    if (production.isCurrentUserShift !== true) continue;
    const personalPath = `productions/${targetUid}/weeks/${getWeekId(production.date)}/productions/${production.id}`;
    const existingPersonal = await getDocument<ProductionWithCrewSource>(personalPath).catch(() => null);
    const hasAuthoritativeIncomingCrew = (production as ProductionWithCrewSource).crewSource === 'popup'
      || (production as ProductionWithCrewSource).popupParsed === true;
    const incomingCrewSource = (production as ProductionWithCrewSource).crewSource;
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
      : incomingCrewSource === 'department'
        ? 'department'
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
  const removedPersonal = marked.identityAvailable
    ? await removeStalePersonalAssignments(targetUid, resolvedProductions)
    : 0;
  return { personal, global, removedPersonal };
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
      if (!url && looksLikePopupCrewInput(input)) {
        const popupProductions = await productionsFromPopupInput(targetUid, input);
        if (!popupProductions.length) return NextResponse.json({ error: 'נמצאו טבלאות צוות, אך לא נמצאו הפקות תואמות לפי השם והתאריך.' }, { status: 422 });
        if (body.preview) return NextResponse.json({ ok: true, preview: popupProductions, source: 'popup-html' });
        const result = await saveProductions(targetUid, authUser.uid, popupProductions, 'popup-html');
        return NextResponse.json({ ok: true, ...result, source: 'popup-html' });
      }
      if (url) {
        const imported = await fetchHerzliyaProductions(url);
        const live = hasDepartmentOnlyCrew(imported.productions) || isIncompleteHerzliyaCrewImport(imported.productions)
          ? await enrichWithLiveShowCrew(imported.productions, url)
          : { productions: imported.productions, fetched: 0, failed: 0 };
        const importedProductions = live.productions;
        const validationError = validateParsedProductions(importedProductions);
        if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });
        const incompleteCrew = isIncompleteHerzliyaCrewImport(importedProductions);
        const departmentCrew = hasDepartmentOnlyCrew(importedProductions);
        if (body.preview) {
          return NextResponse.json({
            ok: true,
            preview: importedProductions,
            source: live.fetched > 0 ? 'url-showcrew-live' : 'url',
            incompleteCrew,
            departmentCrew,
            popupFetched: live.fetched,
            popupFailed: live.failed,
            warning: incompleteCrew ? incompleteCrewMessage() : departmentCrew ? departmentOnlyCrewMessage() : undefined,
          });
        }
        const result = await saveProductions(targetUid, authUser.uid, importedProductions, live.fetched > 0 ? 'url-showcrew-live' : 'url');
        return NextResponse.json({ ok: true, ...result, source: live.fetched > 0 ? 'url-showcrew-live' : 'url', incompleteCrew, departmentCrew, popupFetched: live.fetched, popupFailed: live.failed });
      }
      const imported = await parseBundle(input, url || undefined);
      const validationError = validateParsedProductions(imported.productions);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });
      const incompleteCrew = isIncompleteHerzliyaCrewImport(imported.productions);
      const departmentCrew = hasDepartmentOnlyCrew(imported.productions);
      if (body.preview) {
        return NextResponse.json({
          ok: true,
          preview: imported.productions,
          source: imported.source,
          workerName: imported.workerName || '',
          incompleteCrew,
          departmentCrew,
          popupFetched: imported.popupFetched || 0,
          popupFailed: imported.popupFailed || 0,
          warning: incompleteCrew ? incompleteCrewMessage() : departmentCrew ? departmentOnlyCrewMessage() : undefined,
        });
      }
      const result = await saveProductions(targetUid, authUser.uid, imported.productions, imported.source);
      return NextResponse.json({ ok: true, ...result, workerName: imported.workerName || '', source: imported.source, incompleteCrew, departmentCrew, popupFetched: imported.popupFetched || 0, popupFailed: imported.popupFailed || 0 });
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
