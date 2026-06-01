import {
  parseScheduleHTML,
  extractHerzliyaBaseUrl,
  buildHerzliyaPopupUrl,
  parseHerzliyaPopupHtml,
  extractHerzliyaEventIds,
  extractStudioFromPopup,
} from '@/lib/productionScheduleParser';
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay } from '@/lib/productionDiff';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';

export type SyncResult =
  | { status: 'success'; count: number }
  | { status: 'empty' }
  | { status: 'error'; error: string };

export type UserCalendarSyncDoc = {
  uid: string;
  url: string;
  workerName: string;
  savedAt: number;
  weekStart: string; // ISO date of Sunday that starts the week this URL was saved for
  lastSyncAt?: number;
  lastSyncStatus?: 'success' | 'error' | 'empty';
  lastSyncCount?: number;
  lastSyncError?: string | null;
};

/** Returns the ISO date (YYYY-MM-DD) of the Sunday starting the current Israeli week */
export function getCurrentWeekStartIsrael(): string {
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const d = new Date(israelDate);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().split('T')[0];
}

const FETCH_OPTIONS: RequestInit = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  },
  // @ts-expect-error - Node.js 20 experimental option
  rejectUnauthorized: false,
};

export async function syncHerzliyaUrl(uid: string, url: string): Promise<SyncResult> {
  const deptUrl = new URL(url);
  deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');

  const [personalResponse, deptResult] = await Promise.all([
    fetch(url, FETCH_OPTIONS),
    fetch(deptUrl.toString(), FETCH_OPTIONS).catch(() => null),
  ]);

  if (!personalResponse.ok) throw new Error(`HTTP ${personalResponse.status} from Herzliya`);

  const personalHtml = await personalResponse.text();
  const deptHtml = deptResult?.ok ? await deptResult.text() : '';
  const deptSameAsPersonal = deptHtml === personalHtml;
  const parsed = parseScheduleHTML(personalHtml, deptSameAsPersonal ? '' : deptHtml);

  if (parsed.productions.length === 0) return { status: 'empty' };

  // Enrich crew via ShowCrew popup (server-side)
  if (personalHtml.includes('openmd2')) {
    const baseUrl =
      extractHerzliyaBaseUrl(personalHtml) ||
      (() => {
        try {
          const u = new URL(url);
          return `${u.protocol}//${u.host}${u.pathname}`;
        } catch {
          return '';
        }
      })();

    if (baseUrl) {
      const events = extractHerzliyaEventIds(personalHtml);
      const nameToId: Record<string, number> = {};
      for (const e of events) nameToId[e.name] = e.herzliyaId;

      const uniqueIds = [...new Set(events.map(e => e.herzliyaId))];
      const popupCache: Record<number, string> = {};

      await Promise.allSettled(
        uniqueIds.map(async (id) => {
          const popupUrl = buildHerzliyaPopupUrl(baseUrl, id);
          if (!popupUrl) return;
          const res = await fetch(popupUrl, FETCH_OPTIONS).catch(() => null);
          if (res?.ok) popupCache[id] = await res.text();
        }),
      );

      for (const prod of parsed.productions) {
        const herzliyaId = nameToId[prod.name];
        if (!herzliyaId || !popupCache[herzliyaId]) continue;
        const popupHtml = popupCache[herzliyaId];

        // Extract studio/location from popup header (more reliable than parsing from name)
        const popupStudio = extractStudioFromPopup(popupHtml);
        if (popupStudio) prod.studio = popupStudio;

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
  }

  const productions = parsed.productions.map(prod => ({
    ...prod,
    id: prod.id || generateProductionId(prod.name, prod.date, prod.studio),
    day: prod.day || getHebrewDay(prod.date),
  }));

  await Promise.allSettled(
    productions.map(prod => {
      const doc: GlobalProductionDoc = toGlobalProduction(prod, uid, 'herzliyaSync');
      return patchDocument(`global_productions/${doc.id}`, doc as unknown as Record<string, string>);
    }),
  );

  void syncContactsFromSavedProductions(true).catch(() => {});

  return { status: 'success', count: productions.length };
}
