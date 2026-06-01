import {
  parseScheduleHTML,
  parseHerzliyaPopupHtml,
  extractHerzliyaEventIds,
  extractStudioFromPopup,
  extractDateFromPopup,
} from '@/lib/productionScheduleParser';
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay } from '@/lib/productionDiff';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import type { Production, CrewMember } from '@/lib/productionDiff';

export type SyncResult =
  | { status: 'success'; count: number; studios?: Array<{ name: string; studio: string }>; debug?: string }
  | { status: 'empty'; debug?: string }
  | { status: 'error'; error: string };

export type UserCalendarSyncDoc = {
  uid: string;
  url: string;
  workerName: string;
  savedAt: number;
  weekStart: string;
  lastSyncAt?: number;
  lastSyncStatus?: 'success' | 'error' | 'empty';
  lastSyncCount?: number;
  lastSyncError?: string | null;
};

export function getCurrentWeekStartIsrael(): string {
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const d = new Date(israelDate);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

const BASE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
};

/**
 * Build popup URL by cloning the original Herzliya URL and switching prgname to ShowCrew.
 * This preserves any session/auth query params embedded in the user's URL.
 */
function buildPopupUrl(originalUrl: string, herzliyaId: number): string {
  try {
    const u = new URL(originalUrl);
    u.searchParams.set('prgname', 'ShowCrew');
    u.searchParams.set('arguments', `-N${herzliyaId}`);
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * Extract cookies from a fetch response for passthrough to subsequent requests.
 * Magic XPA may set session cookies on the first request.
 */
function extractCookies(response: Response): string {
  const raw = response.headers.get('set-cookie');
  if (!raw) return '';
  // Multiple Set-Cookie headers arrive as comma-joined in Node.js fetch
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export async function syncHerzliyaUrl(uid: string, url: string): Promise<SyncResult> {
  const debugLines: string[] = [];

  const deptUrl = new URL(url);
  deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');

  const mainFetchOpts: RequestInit = {
    headers: BASE_HEADERS,
    // @ts-expect-error - Node.js 20
    rejectUnauthorized: false,
  };

  const [personalResponse, deptResult] = await Promise.all([
    fetch(url, mainFetchOpts),
    fetch(deptUrl.toString(), mainFetchOpts).catch(() => null),
  ]);

  if (!personalResponse.ok) throw new Error(`HTTP ${personalResponse.status} from Herzliya`);

  // Carry session cookies (if any) into popup requests
  const sessionCookie = extractCookies(personalResponse);
  const popupFetchOpts: RequestInit = {
    headers: {
      ...BASE_HEADERS,
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      Referer: url,
    },
    // @ts-expect-error - Node.js 20
    rejectUnauthorized: false,
  };

  const personalHtml = await personalResponse.text();
  const deptHtml = deptResult?.ok ? await deptResult.text() : '';
  const deptSameAsPersonal = deptHtml === personalHtml;

  const parsed = parseScheduleHTML(personalHtml, deptSameAsPersonal ? '' : deptHtml);
  debugLines.push(`htmlParse:${parsed.productions.length}`);

  if (personalHtml.includes('openmd2')) {
    const events = extractHerzliyaEventIds(personalHtml);
    debugLines.push(`events:${events.length}`);

    const nameToId: Record<string, number> = {};
    for (const e of events) {
      nameToId[e.name] = e.herzliyaId;
      const cleaned = e.name.replace(/\s*(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?\s*/gi, '').trim();
      if (cleaned && cleaned !== e.name) nameToId[cleaned] = e.herzliyaId;
    }

    // Fetch all popups: try session-aware URL first, fall back to clean ShowCrew URL
    const uniqueIds = [...new Set(events.map(e => e.herzliyaId))];
    const popupCache: Record<number, string> = {};
    let popupOk = 0, popupFail = 0;

    await Promise.allSettled(
      uniqueIds.map(async (id) => {
        const popupUrl = buildPopupUrl(url, id);
        if (!popupUrl) return;
        try {
          const res = await fetch(popupUrl, popupFetchOpts);
          if (res.ok) {
            const html = await res.text();
            // Only cache if the response looks like actual crew data (contains a table)
            if (html.includes('<table') || html.includes('<TABLE')) {
              popupCache[id] = html;
              popupOk++;
            } else {
              debugLines.push(`popup${id}:no-table(${html.slice(0,80).replace(/\s+/g,' ')})`);
              popupFail++;
            }
          } else {
            debugLines.push(`popup${id}:http${res.status}`);
            popupFail++;
          }
        } catch (e) {
          debugLines.push(`popup${id}:err(${String(e).slice(0,60)})`);
          popupFail++;
        }
      }),
    );

    debugLines.push(`popupOk:${popupOk} popupFail:${popupFail}`);

    // Build productions from popup data when HTML parse returned nothing
    if (parsed.productions.length === 0) {
      const seenIds = new Set<number>();
      for (const event of events) {
        if (seenIds.has(event.herzliyaId)) continue;
        seenIds.add(event.herzliyaId);
        const popupHtml = popupCache[event.herzliyaId];
        if (!popupHtml) continue;
        const popupDate = extractDateFromPopup(popupHtml);
        if (!popupDate) continue;
        const popupStudio = extractStudioFromPopup(popupHtml);
        const studioM = event.name.match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
        const studio = popupStudio || (studioM ? studioM[0].trim() : '');
        const name = studioM ? event.name.replace(studioM[0], '').replace(/\s{2,}/g, ' ').trim() : event.name;
        const popupCrew = parseHerzliyaPopupHtml(popupHtml);
        const crew: CrewMember[] = popupCrew.map(pc => ({
          name: pc.name, role: pc.role, roleDetail: '', phone: pc.phone,
          startTime: pc.startTime, endTime: pc.endTime, isCurrentUser: false,
        }));
        parsed.productions.push({
          id: String(event.herzliyaId),
          name,
          studio,
          date: popupDate,
          day: getHebrewDay(popupDate),
          startTime: '',
          endTime: '',
          status: 'scheduled',
          crew,
          herzliyaId: event.herzliyaId,
        } as Production);
      }
    }

    // Enrich parsed productions with popup data (studio, date, crew)
    for (const prod of parsed.productions) {
      const herzliyaId = prod.herzliyaId || nameToId[prod.name];
      if (!herzliyaId || !popupCache[herzliyaId]) continue;
      const popupHtml = popupCache[herzliyaId];

      const popupStudio = extractStudioFromPopup(popupHtml);
      if (popupStudio) prod.studio = popupStudio;

      const popupDate = extractDateFromPopup(popupHtml);
      if (popupDate && popupDate !== prod.date) {
        prod.date = popupDate;
        prod.day = getHebrewDay(popupDate);
      }
      if (herzliyaId) prod.id = String(herzliyaId);

      const popupCrew = parseHerzliyaPopupHtml(popupHtml);
      for (const pc of popupCrew) {
        const exists = prod.crew.find(c => c.name === pc.name);
        if (!exists) {
          prod.crew.push({ name: pc.name, role: pc.role, roleDetail: '', phone: pc.phone, startTime: pc.startTime, endTime: pc.endTime, isCurrentUser: false });
        } else if (!exists.phone && pc.phone) {
          exists.phone = pc.phone;
        }
      }
    }
  }

  if (parsed.productions.length === 0) {
    const debug = debugLines.join(' | ');
    console.log('[herzliyaSync] empty:', debug);
    return { status: 'empty', debug };
  }

  const productions = parsed.productions.map(prod => ({
    ...prod,
    id: prod.herzliyaId ? String(prod.herzliyaId) : (prod.id || generateProductionId(prod.name, prod.date, prod.studio)),
    day: prod.day || getHebrewDay(prod.date),
  }));

  await Promise.allSettled(
    productions.map(prod => {
      const doc: GlobalProductionDoc = toGlobalProduction(prod, uid, 'herzliyaSync');
      return patchDocument(`global_productions/${doc.id}`, doc as unknown as Record<string, string>);
    }),
  );

  void syncContactsFromSavedProductions(true).catch(() => {});

  const studioSummary = productions.map(p => `${p.name}→"${p.studio}"`).join(', ');
  const debug = debugLines.join(' | ');
  console.log('[herzliyaSync] saved', productions.length, '| studios:', studioSummary, '| debug:', debug);

  return {
    status: 'success',
    count: productions.length,
    studios: productions.map(p => ({ name: p.name, studio: p.studio })),
    debug,
  };
}
