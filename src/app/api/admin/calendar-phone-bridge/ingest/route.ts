import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument, getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import {
  extractDateFromPopup,
  extractNameFromPopup,
  extractStudioFromPopup,
  parseHerzliyaPopupHtml,
  parseScheduleHTML,
} from '@/lib/productionScheduleParser';
import { mergeGlobalProduction, toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { getHebrewDay, getWeekId, type Production } from '@/lib/productionDiff';
import { getPrimaryAdminUid } from '@/lib/server/primaryAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

type BridgeTokenDoc = {
  token?: string;
  targetUid?: string;
  createdBy?: string;
  createdAt?: number;
  expiresAt?: number;
  usedAt?: number | null;
  status?: string;
};

type ProductionWithSource = Production & {
  crewSource?: string;
  popupParsed?: boolean;
};

type IngestPayload = {
  token?: string;
  scheduleHtml?: string;
  departmentHtml?: string;
  popupHtmlById?: Record<string, string>;
  href?: string;
};

function cors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'content-type');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

async function parsePayload(request: NextRequest): Promise<IngestPayload> {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as IngestPayload;
}

function popupProductionPatch(html: string): Partial<ProductionWithSource> {
  const crew = parseHerzliyaPopupHtml(html).map((member) => ({
    ...member,
    roleDetail: member.role,
    phone: member.phone || null,
  }));
  return {
    ...(extractNameFromPopup(html) ? { name: extractNameFromPopup(html) } : {}),
    ...(extractStudioFromPopup(html) ? { studio: extractStudioFromPopup(html) } : {}),
    ...(extractDateFromPopup(html) ? { date: extractDateFromPopup(html), day: getHebrewDay(extractDateFromPopup(html)) } : {}),
    crew,
    crewSource: 'popup',
    popupParsed: crew.length > 0,
  };
}

function buildProductions(payload: IngestPayload): ProductionWithSource[] {
  const parsed = parseScheduleHTML(payload.scheduleHtml || '', payload.departmentHtml || '');
  const popupHtmlById = payload.popupHtmlById || {};
  return parsed.productions
    .filter((production) => production.herzliyaId && production.herzliyaId > 0)
    .map((production) => {
      const popupHtml = popupHtmlById[String(production.herzliyaId)] || '';
      const base: ProductionWithSource = {
        ...production,
        id: String(production.herzliyaId),
        day: production.day || getHebrewDay(production.date),
        status: production.status || 'scheduled',
        isCurrentUserShift: true,
      };
      if (!popupHtml) return base;
      const patch = popupProductionPatch(popupHtml);
      return {
        ...base,
        ...patch,
        id: String(production.herzliyaId),
        herzliyaId: production.herzliyaId,
        startTime: production.startTime || base.startTime,
        endTime: production.endTime || base.endTime,
        isCurrentUserShift: true,
      };
    });
}

function validateProductions(productions: ProductionWithSource[]): string | null {
  if (!productions.length) return 'לא נמצאו הפקות עם מזהה הרצליה אמיתי בדף שנשלח.';
  if (productions.length > 100) return 'נמצאו יותר מדי הפקות. הפעלה מטלפון מיועדת ללוח שבועי בלבד.';
  const withoutPopup = productions.filter((production) => production.crewSource !== 'popup' || !production.popupParsed || !production.crew?.length);
  if (withoutPopup.length > 0) {
    return `חסרים פופאפי צוותים עבור ${withoutPopup.length} הפקות. שום נתון לא נשמר.`;
  }
  const badDates = productions.filter((production) => !/^\d{4}-\d{2}-\d{2}$/.test(production.date || ''));
  if (badDates.length > 0) return 'נמצאו הפקות עם תאריך לא תקין. שום נתון לא נשמר.';
  const generic = productions.filter((production) => !production.name || production.name === 'הפקה');
  if (generic.length > 0) return 'נמצאו הפקות ללא שם תקין. שום נתון לא נשמר.';
  return null;
}

async function saveProductions(targetUid: string, productions: ProductionWithSource[]) {
  const now = new Date().toISOString();
  const adminUid = getPrimaryAdminUid();
  let personal = 0;
  let global = 0;
  const weekIds = new Set(productions.map((production) => getWeekId(production.date)));

  for (const production of productions) {
    const normalized: ProductionWithSource = {
      ...production,
      id: String(production.herzliyaId || production.id),
      day: production.day || getHebrewDay(production.date),
      status: production.status || 'scheduled',
      crew: production.crew || [],
      isCurrentUserShift: true,
      lastUpdatedBy: `phone-bridge:${adminUid}`,
      lastUpdatedAt: now,
      crewSource: 'popup',
      popupParsed: true,
    };

    const globalDoc = toGlobalProduction(normalized, adminUid, `phone-bridge/${getWeekId(normalized.date)}`);
    const existingGlobal = await getDocument<GlobalProductionDoc>(`global_productions/${globalDoc.id}`).catch(() => null);
    const mergedGlobal = mergeGlobalProduction(existingGlobal, globalDoc);
    await patchDocument(`global_productions/${globalDoc.id}`, mergedGlobal as unknown as Record<string, string>);
    global += 1;

    await patchDocument(`productions/${targetUid}/weeks/${getWeekId(normalized.date)}/productions/${normalized.id}`, {
      ...normalized,
      missingCandidate: false,
      source: 'phone-bridge',
    } as unknown as Record<string, string>);
    personal += 1;
  }

  for (const weekId of weekIds) {
    const docs = await listDocuments<Production & { source?: string }>(`productions/${targetUid}/weeks/${weekId}/productions`).catch(() => []);
    await Promise.all(docs
      .filter((doc) => doc.source === 'manual-emergency-personal-html' && doc.id && productions.some((production) => String(production.herzliyaId || production.id) === doc.id))
      .map((doc) => deleteDocument(`productions/${targetUid}/weeks/${weekId}/productions/${doc.id}`)));
  }

  return { personal, global, weekIds: Array.from(weekIds) };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parsePayload(request);
    const token = String(payload.token || '').trim();
    if (!token) return cors(NextResponse.json({ error: 'חסר טוקן גשר' }, { status: 401 }));

    const tokenDoc = await getDocument<BridgeTokenDoc>(`calendar_phone_bridge_tokens/${token}`).catch(() => null);
    if (!tokenDoc || tokenDoc.status !== 'active') {
      return cors(NextResponse.json({ error: 'טוקן לא תקין או כבר נוצל' }, { status: 403 }));
    }
    if (tokenDoc.createdBy !== getPrimaryAdminUid()) {
      return cors(NextResponse.json({ error: 'הטוקן לא נוצר על ידי המנהל הראשי' }, { status: 403 }));
    }
    if (!tokenDoc.expiresAt || tokenDoc.expiresAt < Date.now()) {
      return cors(NextResponse.json({ error: 'הטוקן פג תוקף. צור טוקן חדש בממשק הניהול.' }, { status: 403 }));
    }

    const productions = buildProductions(payload);
    const validationError = validateProductions(productions);
    if (validationError) return cors(NextResponse.json({ error: validationError }, { status: 422 }));

    const result = await saveProductions(String(tokenDoc.targetUid || ''), productions);
    await patchDocument(`calendar_phone_bridge_tokens/${token}`, {
      usedAt: Date.now(),
      status: 'used',
      href: String(payload.href || '').slice(0, 500),
      productionCount: result.personal,
    });

    return cors(NextResponse.json({ ok: true, ...result }));
  } catch (error) {
    return cors(NextResponse.json({
      error: error instanceof Error ? error.message : 'ייבוא מהטלפון נכשל',
    }, { status: 500 }));
  }
}
