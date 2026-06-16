import {
  parseScheduleHTML,
  parseHerzliyaPopupHtml,
  extractHerzliyaEventIds,
  extractHerzliyaBaseUrl,
  buildHerzliyaPopupUrl,
  extractStudioFromPopup,
  extractDateFromPopup,
  splitHerzliyaRole,
} from '@/lib/productionScheduleParser';
import { mergeGlobalProduction, toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { generateProductionId, getHebrewDay } from '@/lib/productionDiff';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
import type { Production, CrewMember } from '@/lib/productionDiff';

export type SyncResult =
  | { status: 'success'; count: number; studios?: Array<{ name: string; studio: string }>; debug?: string; finalUrl?: string }
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

export type ParsedHerzliyaResult = {
  productions: Production[];
  debug: string;
  finalUrl?: string;
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

export function getPreviousWeekStart(weekStart: string): string {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().split('T')[0];
}

const BASE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
};

/**
 * Extract cookies from a fetch response for passthrough to subsequent requests.
 * Node.js 20 (undici) exposes each Set-Cookie header separately via getSetCookie().
 */
function extractCookies(response: Response): string {
  const headersAny = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headersAny.getSetCookie === 'function') {
    return headersAny.getSetCookie()
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }
  const raw = response.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

/**
 * Extract Magic XPA session argument (-A{id}) from a URL or raw string.
 * Session tokens are alphanumeric and contain at least one letter (not all-digit dates like 20062026).
 */
function extractMagicXpaSession(str: string): string {
  // Matches -A followed by alphanumeric that contains at least one letter (not a date like 20062026)
  const SESSION_RE = /-A([a-zA-Z0-9]*[a-zA-Z][a-zA-Z0-9]{5,})/;
  try {
    const u = new URL(str);
    const args = u.searchParams.get('arguments') || '';
    const m = args.match(SESSION_RE);
    if (m) return `-A${m[1]}`;
  } catch { /* fall through to raw string search */ }
  const m = str.match(SESSION_RE);
  return m ? `-A${m[1]}` : '';
}

/**
 * Find Magic XPA session argument in the page HTML.
 * Looks in JavaScript openmd2 function definitions and inline script blocks.
 */
function extractMagicXpaSessionFromHtml(html: string): string {
  // Common patterns where Magic XPA embeds the session in the HTML:
  // "arguments=-A{sess}-N"+id  or  "ShowCrew&arguments=-A{sess}"
  const patterns = [
    /arguments=-A([a-zA-Z0-9]{6,})/,
    /ShowCrew[^"'<]{0,60}-A([a-zA-Z0-9]{6,})/,
    /-A([a-zA-Z0-9]{8,})-N/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return `-A${m[1]}`;
  }
  return '';
}

/**
 * Fetch and parse a Herzliya schedule URL — personal view + department view + ShowCrew popups.
 * Returns parsed productions with normalized IDs. Does NOT write to Firestore.
 */
export async function fetchHerzliyaProductions(url: string): Promise<ParsedHerzliyaResult> {
  const debugLines: string[] = [];

  const deptUrl = new URL(url);
  deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');

  const mainFetchOpts: RequestInit = {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(10000),
    // @ts-expect-error - Node.js 20
    rejectUnauthorized: false,
  };

  const [personalResponse, deptResult] = await Promise.all([
    fetch(url, mainFetchOpts),
    fetch(deptUrl.toString(), mainFetchOpts).catch(() => null),
  ]);

  if (!personalResponse.ok) throw new Error(`HTTP ${personalResponse.status} from Herzliya`);

  const finalUrl: string = (personalResponse as Response & { url?: string }).url || url;
  debugLines.push(`finalUrl:${finalUrl.slice(0, 80)}`);

  const sessionCookie = extractCookies(personalResponse);
  const popupFetchOpts: RequestInit = {
    headers: {
      ...BASE_HEADERS,
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      Referer: finalUrl,
    },
    // @ts-expect-error - Node.js 20
    rejectUnauthorized: false,
  };

  const personalHtml = await personalResponse.text();
  const deptHtml = deptResult?.ok ? await deptResult.text() : '';

  const htmlBaseUrl = extractHerzliyaBaseUrl(personalHtml);
  const popupBaseUrl = htmlBaseUrl || finalUrl;
  debugLines.push(`popupBaseUrl:${popupBaseUrl.slice(0, 80)}`);

  // If the URL is a sendwa.html (WhatsApp-share format), it doesn't have the MagicXPA
  // calendar interface. Try to find a link to the real mgrqispi.dll schedule view in the HTML.
  let effectivePersonalHtml = personalHtml;
  let effectiveDeptHtml = deptHtml;
  if (url.includes('sendwa.html') && !personalHtml.includes('openmd2')) {
    // Show a snippet of sendwa HTML for debugging format
    const bodyMatch = personalHtml.match(/<body[^>]*>([\s\S]{0,600})/i);
    const snippet = (bodyMatch ? bodyMatch[1] : personalHtml.slice(0, 600)).replace(/\s+/g, ' ').trim();
    debugLines.push(`sendwaSnippet:${snippet.slice(0, 400)}`);

    const mgrqMatch = personalHtml.match(/https?:\/\/[^"'<\s]+mgrqispi\.dll[^"'<\s]*/i);
    if (mgrqMatch) {
      const mgrqUrl = mgrqMatch[0];
      debugLines.push(`sendwaRedirect:${mgrqUrl.slice(0, 100)}`);
      try {
        const [mgrqResp, mgrqDeptResp] = await Promise.all([
          fetch(mgrqUrl, mainFetchOpts),
          fetch(mgrqUrl.includes('ShowFmp') ? mgrqUrl : (() => { const u = new URL(mgrqUrl); u.searchParams.set('HSELWEBprgnameShowFmp', '1'); return u.toString(); })(), mainFetchOpts).catch(() => null),
        ]);
        if (mgrqResp.ok) {
          effectivePersonalHtml = await mgrqResp.text();
          effectiveDeptHtml = mgrqDeptResp?.ok ? await mgrqDeptResp.text() : '';
          debugLines.push(`sendwaHtml:${effectivePersonalHtml.includes('openmd2') ? 'hasOpenmd2' : 'noOpenmd2'}`);
        }
      } catch (e) {
        debugLines.push(`sendwaErr:${String(e).slice(0, 60)}`);
      }
    }
  }

  const magicXpaSession = extractMagicXpaSession(finalUrl) || extractMagicXpaSessionFromHtml(effectivePersonalHtml);
  debugLines.push(`magicSession:${magicXpaSession || 'none'}`);

  const deptSameAsPersonal = effectiveDeptHtml === effectivePersonalHtml;
  const parsed = parseScheduleHTML(effectivePersonalHtml, deptSameAsPersonal ? '' : effectiveDeptHtml);
  debugLines.push(`htmlParse:${parsed.productions.length}`);

  if (effectivePersonalHtml.includes('openmd2')) {
    const events = extractHerzliyaEventIds(effectivePersonalHtml);
    debugLines.push(`events:${events.length}`);

    const nameToId: Record<string, number> = {};
    const idToEventName: Record<number, string> = {};
    for (const e of events) {
      nameToId[e.name] = e.herzliyaId;
      idToEventName[e.herzliyaId] = e.name;
      const { name: nameNoRole } = splitHerzliyaRole(e.name);
      if (nameNoRole !== e.name) nameToId[nameNoRole] = e.herzliyaId;
      const cleaned = nameNoRole.replace(/\s*(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?\s*/gi, '').trim();
      if (cleaned && cleaned !== nameNoRole) nameToId[cleaned] = e.herzliyaId;
    }

    const calendarDates: string[] = [];
    const firstEventPos = effectivePersonalHtml.indexOf('openmd2');
    const headerSection = firstEventPos > 0 ? effectivePersonalHtml.slice(0, firstEventPos) : effectivePersonalHtml.slice(0, 3000);
    for (const m of headerSection.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
      const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (!calendarDates.includes(iso)) calendarDates.push(iso);
    }
    debugLines.push(`calDates:${calendarDates.length}`);

    const uniqueIds = [...new Set(events.map(e => e.herzliyaId))];
    const popupCache: Record<number, string> = {};
    let popupOk = 0, popupFail = 0;

    await Promise.allSettled(
      uniqueIds.map(async (id) => {
        let popupUrl = '';
        try {
          const u = new URL(popupBaseUrl);
          u.searchParams.set('appname', 'HsILWeb');
          u.searchParams.set('prgname', 'ShowCrew');
          u.searchParams.set('arguments', magicXpaSession ? `${magicXpaSession}-N${id}` : `-N${id}`);
          popupUrl = u.toString();
        } catch {
          popupUrl = buildHerzliyaPopupUrl(popupBaseUrl, id);
        }
        if (!popupUrl) return;
        try {
          const res = await fetch(popupUrl, { ...popupFetchOpts, signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const html = await res.text();
            if (html.includes('<table') || html.includes('<TABLE')) {
              popupCache[id] = html;
              popupOk++;
            } else {
              debugLines.push(`popup${id}:no-table(${html.slice(0,80).replace(/\s+/g,' ')})`);
              popupFail++;
              if (magicXpaSession) {
                const fallbackUrl = buildHerzliyaPopupUrl(popupBaseUrl, id);
                const res2 = await fetch(fallbackUrl, popupFetchOpts).catch(() => null);
                if (res2?.ok) {
                  const html2 = await res2.text();
                  if (html2.includes('<table') || html2.includes('<TABLE')) {
                    popupCache[id] = html2;
                    popupOk++;
                    popupFail--;
                    debugLines.push(`popup${id}:fallback-ok`);
                  }
                }
              }
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

    if (parsed.productions.length === 0) {
      const seenIds = new Set<number>();
      let builtIdx = 0;
      for (const event of events) {
        if (seenIds.has(event.herzliyaId)) continue;
        seenIds.add(event.herzliyaId);
        const popupHtml = popupCache[event.herzliyaId];
        const popupDate = popupHtml ? extractDateFromPopup(popupHtml) : '';
        const fallbackDate = calendarDates[builtIdx] || calendarDates[0] || '';
        builtIdx++;
        const date = popupDate || fallbackDate;
        if (!date) continue;
        const popupStudio = popupHtml ? extractStudioFromPopup(popupHtml) : '';
        const { name: nameNoRole } = splitHerzliyaRole(event.name);
        const studioM = nameNoRole.match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
        const studio = popupStudio || (studioM ? studioM[0].trim() : '');
        const name = studioM ? nameNoRole.replace(studioM[0], '').replace(/\s{2,}/g, ' ').trim() : nameNoRole;
        const popupCrew = popupHtml ? parseHerzliyaPopupHtml(popupHtml) : [];
        const crew: CrewMember[] = popupCrew.map(pc => ({
          name: pc.name, role: pc.role, roleDetail: '', phone: pc.phone,
          startTime: pc.startTime, endTime: pc.endTime, isCurrentUser: false,
        }));
        parsed.productions.push({
          id: String(event.herzliyaId),
          name,
          studio,
          date,
          day: getHebrewDay(date),
          startTime: '',
          endTime: '',
          status: 'scheduled',
          crew,
          herzliyaId: event.herzliyaId,
        } as Production);
      }
      debugLines.push(`builtFromEvents:${parsed.productions.length}`);
    }

    for (const prod of parsed.productions) {
      const herzliyaId = prod.herzliyaId || nameToId[prod.name];

      if (!prod.studio && herzliyaId && idToEventName[herzliyaId]) {
        const studioM = idToEventName[herzliyaId].match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
        if (studioM) prod.studio = studioM[0].trim();
      }

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

  const productions = parsed.productions.map(prod => ({
    ...prod,
    id: prod.herzliyaId ? String(prod.herzliyaId) : (prod.id || generateProductionId(prod.name, prod.date, prod.studio, prod.startTime)),
    day: prod.day || getHebrewDay(prod.date),
  }));

  return {
    productions,
    debug: debugLines.join(' | '),
    finalUrl: finalUrl !== url ? finalUrl : undefined,
  };
}

export async function syncHerzliyaUrl(uid: string, url: string): Promise<SyncResult> {
  const debugLines: string[] = [];

  let parsed: ParsedHerzliyaResult;
  try {
    parsed = await fetchHerzliyaProductions(url);
  } catch (err) {
    throw err; // propagate to caller (cron catches it)
  }

  debugLines.push(parsed.debug);

  if (parsed.productions.length === 0) {
    console.log('[herzliyaSync] empty:', parsed.debug);
    return { status: 'empty', debug: parsed.debug };
  }

  const productions = parsed.productions;

  const snapshotRunId = `${Date.now()}-${uid.slice(0, 10)}-http`;
  await patchDocument(`calendar_sync_snapshots/${snapshotRunId}`, {
    runId: snapshotRunId,
    userId: uid,
    weekId: getCurrentWeekStartIsrael(),
    source: 'herzliya-http-sync',
    createdAt: new Date().toISOString(),
    status: 'captured',
    incomingCount: productions.length,
  });

  for (const production of productions) {
    const existing = await getDocument<GlobalProductionDoc>(`global_productions/${production.id}`);
    await patchDocument(
      `calendar_sync_snapshots/${snapshotRunId}/entries/${`${uid}_${production.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 1400)}`,
      {
        productionId: production.id,
        restorePersonal: false,
        beforeGlobal: existing,
        incoming: production,
      } as unknown as Record<string, string>,
    );
  }

  const writeResults = await Promise.allSettled(
    productions.map(prod => {
      const doc: GlobalProductionDoc = toGlobalProduction(prod, uid, 'herzliyaSync');
      return getDocument<GlobalProductionDoc>(`global_productions/${doc.id}`)
        .then((existing) => mergeGlobalProduction(existing, doc))
        .then((merged) =>
          patchDocument(`global_productions/${doc.id}`, merged as unknown as Record<string, string>),
        );
    }),
  );
  const failedWrites = writeResults.filter((result) => result.status === 'rejected');
  if (failedWrites.length) {
    throw new Error(`Failed to write ${failedWrites.length} global productions`);
  }
  await patchDocument(`calendar_sync_snapshots/${snapshotRunId}`, {
    status: 'applied',
    appliedAt: new Date().toISOString(),
  });

  void syncContactsFromSavedProductions(true).catch(() => {});

  const studioSummary = productions.map(p => `${p.name}→"${p.studio}"`).join(', ');
  console.log('[herzliyaSync] saved', productions.length, '| studios:', studioSummary, '| debug:', parsed.debug);

  return {
    status: 'success',
    count: productions.length,
    studios: productions.map(p => ({ name: p.name, studio: p.studio })),
    debug: parsed.debug,
    finalUrl: parsed.finalUrl,
  };
}
