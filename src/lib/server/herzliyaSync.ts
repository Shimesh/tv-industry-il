import {
  parseScheduleHTML,
  parseHerzliyaPopupHtml,
  extractHerzliyaEventIds,
  extractHerzliyaBaseUrl,
  buildHerzliyaPopupUrl,
  extractStudioFromPopup,
  extractDateFromPopup,
  extractNameFromPopup,
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
  // Session may be alphanumeric only, or may include = signs (base64-like)
  const patterns = [
    // Literal -A{session}-N pattern (most common in openmd2 function body)
    /-A([a-zA-Z0-9=+/]{8,})-N/,
    // In URL arguments string: arguments=-A{session}
    /arguments=-A([a-zA-Z0-9=+/]{6,})/,
    // ShowCrew URL with -A{session}
    /ShowCrew[^"'<]{0,80}-A([a-zA-Z0-9=+/]{6,})/,
    // Variable-based: var sess="ABC"; ... -A" + sess + "-N
    /['"]([a-zA-Z0-9=+/]{8,})['"]\s*\+?\s*['"]?-N/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      // Reject pure date strings (all digits, length 6-8) like "20062026" or "2"
      if (/^\d+$/.test(m[1])) continue;
      return `-A${m[1]}`;
    }
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

  const personalHtml = await personalResponse.text();
  const deptHtml = deptResult?.ok ? await deptResult.text() : '';

  const htmlBaseUrl = extractHerzliyaBaseUrl(personalHtml);
  const popupBaseUrl = htmlBaseUrl || finalUrl;
  debugLines.push(`popupBaseUrl:${popupBaseUrl.slice(0, 80)}`);

  // If the URL is a sendwa.html (WhatsApp-share format), it doesn't have the MagicXPA
  // calendar interface. Try to find a link to the real mgrqispi.dll schedule view in the HTML.
  let effectivePersonalHtml = personalHtml;
  let effectiveDeptHtml = deptHtml;
  // Cookie used for ShowCrew popup calls — updated with ShowEmp3 session cookie if available
  let effectivePopupCookie = sessionCookie;
  // Base URL for ShowCrew popup calls — for sendwa.html this must be mgrqispi.dll, not sendwa.html
  let effectivePopupBaseUrl = popupBaseUrl;
  // Log raw personalHtml preview for sendwa URLs to understand what server returns
  if (url.includes('sendwa.html')) {
    const hasOpenmd2 = personalHtml.includes('openmd2');
    debugLines.push(`sendwaHtmlPreview:len=${personalHtml.length},openmd2=${hasOpenmd2},body=${personalHtml.slice(0, 80).replace(/\s+/g, ' ')}`);
  }
  if (url.includes('sendwa.html') && !personalHtml.includes('openmd2')) {
    // sendwa.html JS constructs: mgrqispi.dll?appname=HsILWEB&prgname=ShowEmp3&arguments=-N{a1},-A{a2}
    // where A param format is "{a1}.{a2}" (e.g. "934F-A8FD-...-DB70.2" → a1=GUID, a2="2")
    const sendwaAParam = (() => { try { return new URL(url).searchParams.get('A'); } catch { return null; } })();
    if (sendwaAParam) {
      debugLines.push(`sendwaA:${sendwaAParam.slice(0, 60)}`);
      // JS does aParam.split('.') — some URLs use '.' others use ',' as separator
      const parts = sendwaAParam.split(/[.,]/);
      const a1 = parts[0] ?? '';
      const a2 = parts[1] ?? '';
      debugLines.push(`sendwaParts:a1len=${a1.length},a2=${a2.slice(0,10)},pbu=${!!popupBaseUrl}`);
      if (a1 && a2 && popupBaseUrl) {
        const baseOrigin = new URL(popupBaseUrl).origin;
        const mgrqBase = `${baseOrigin}/magicscripts/mgrqispi.dll`;
        effectivePopupBaseUrl = mgrqBase;
        const showEmp3Url = `${mgrqBase}?appname=HsILWEB&prgname=ShowEmp3&arguments=-N${a1},-A${a2}`;
        debugLines.push(`showEmp3Url:${showEmp3Url.slice(0, 120)}`);

        // Step 1: Hit the main app to get a MagicXPA session cookie
        let initCookie = sessionCookie || '';
        try {
          const initUrl = `${baseOrigin}/magicscripts/mgrqispi.dll?appname=HsILWEB&prgname=Main`;
          const initResp = await fetch(initUrl, {
            headers: BASE_HEADERS,
            signal: AbortSignal.timeout(8000),
            // @ts-expect-error - Node.js 20
            rejectUnauthorized: false,
          });
          initCookie = extractCookies(initResp) || initCookie;
          debugLines.push(`initCk:${initCookie.slice(0, 40)}`);
        } catch (e) {
          debugLines.push(`initErr:${String(e).slice(0, 60)}`);
        }

        // Step 2: Fetch ShowEmp3 with redirect:manual to detect redirects
        try {
          const sendwaFetchOpts: RequestInit = {
            headers: {
              ...BASE_HEADERS,
              ...(initCookie ? { Cookie: initCookie } : {}),
              Referer: `${baseOrigin}/sendwa.html`,
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'same-origin',
            },
            redirect: 'manual',
            signal: AbortSignal.timeout(12000),
            // @ts-expect-error - Node.js 20
            rejectUnauthorized: false,
          };
          const emp3Resp = await fetch(showEmp3Url, sendwaFetchOpts);
          const ct = emp3Resp.headers.get('content-type') || '';
          const loc = emp3Resp.headers.get('location') || '';
          // Capture ShowEmp3 session cookie — this is what ShowCrew popup calls need
          const emp3Cookie = extractCookies(emp3Resp);
          if (emp3Cookie) effectivePopupCookie = emp3Cookie;
          const emp3Html = await emp3Resp.text();
          debugLines.push(`showEmp3:s=${emp3Resp.status},len=${emp3Html.length},ct=${ct.slice(0,20)},loc=${loc.slice(0,60)},ck=${emp3Cookie.slice(0,30)}`);
          debugLines.push(`showEmp3body:${emp3Html.slice(0, 300).replace(/\s+/g, ' ')}`);

          // If redirect, follow manually
          if ((emp3Resp.status === 301 || emp3Resp.status === 302 || emp3Resp.status === 303) && loc) {
            const followResp = await fetch(loc.startsWith('http') ? loc : `${baseOrigin}${loc}`, {
              ...sendwaFetchOpts, redirect: 'follow',
            });
            const followCookie = extractCookies(followResp);
            if (followCookie) effectivePopupCookie = followCookie;
            const followHtml = await followResp.text();
            debugLines.push(`showEmp3follow:s=${followResp.status},len=${followHtml.length},${followHtml.includes('openmd2') ? 'hasOpenmd2' : `noOpenmd2(${followHtml.slice(0,80).replace(/\s+/g,' ')})`}`);
            if (followHtml.includes('openmd2')) effectivePersonalHtml = followHtml;
          } else if (emp3Html.includes('openmd2')) {
            effectivePersonalHtml = emp3Html;

            // Strategy 1: look for an explicit department-view link in the HTML
            // (e.g. href containing ShowFmp, or onclick with ShowFmp prgname)
            const deptLinkMatch = emp3Html.match(
              /(?:href|location\.href)\s*=\s*["']([^"']*ShowFmp[^"']*)["']/i
            ) || emp3Html.match(
              /["']([^"']*prgname=ShowFmp[^"']*)["']/i
            );
            let deptFetchUrl = '';
            if (deptLinkMatch) {
              const raw = deptLinkMatch[1];
              deptFetchUrl = raw.startsWith('http') ? raw : `${baseOrigin}${raw.startsWith('/') ? '' : '/'}${raw}`;
              debugLines.push(`deptLink:found=${deptFetchUrl.slice(0, 80)}`);
            } else {
              // Strategy 2: add HSELWEBprgnameShowFmp=1 parameter (current approach)
              deptFetchUrl = `${showEmp3Url}&HSELWEBprgnameShowFmp=1`;
              debugLines.push(`deptLink:fallback-param`);
            }

            const deptResp2 = await fetch(deptFetchUrl, { ...sendwaFetchOpts, redirect: 'follow' }).catch(() => null);
            if (deptResp2?.ok) {
              const deptHtml2 = await deptResp2.text();
              const deptEventCount = (deptHtml2.match(/openmd2\(/g) || []).length;
              const personalEventCount = (emp3Html.match(/openmd2\(/g) || []).length;
              debugLines.push(`dept:len=${deptHtml2.length},events=${deptEventCount},personal=${personalEventCount},same=${deptHtml2 === emp3Html}`);
              effectiveDeptHtml = deptHtml2;
            } else {
              debugLines.push(`dept:failed(${deptResp2?.status ?? 'err'})`);
            }
          }
        } catch (e) {
          debugLines.push(`showEmp3Err:${String(e).slice(0, 100)}`);
        }
      }
    }
  }

  const popupFetchOpts: RequestInit = {
    headers: {
      ...BASE_HEADERS,
      ...(effectivePopupCookie ? { Cookie: effectivePopupCookie } : {}),
      Referer: finalUrl,
    },
    // @ts-expect-error - Node.js 20
    rejectUnauthorized: false,
  };

  // For sendwa.html URLs, session must come from the ShowEmp3 response HTML, not the A token
  const magicXpaSession = extractMagicXpaSession(finalUrl) || extractMagicXpaSessionFromHtml(effectivePersonalHtml);
  // Debug: show the openmd2 function definition to understand session embedding format
  const openmd2DefIdx = effectivePersonalHtml.indexOf('openmd2');
  if (openmd2DefIdx >= 0) {
    const start = Math.max(0, openmd2DefIdx - 10);
    debugLines.push(`openmd2def:${effectivePersonalHtml.slice(start, start + 300).replace(/\s+/g, ' ')}`);
  }
  debugLines.push(`magicSession:${magicXpaSession || 'none'},popupBase:${effectivePopupBaseUrl.slice(0,60)}`);

  const deptSameAsPersonal = effectiveDeptHtml === effectivePersonalHtml || !effectiveDeptHtml;
  const parsed = parseScheduleHTML(effectivePersonalHtml, deptSameAsPersonal ? '' : effectiveDeptHtml);
  debugLines.push(`htmlParse:${parsed.productions.length}`);

  // Combine events from both personal and dept HTML — dept view has ALL department productions
  const htmlsToScan = [effectivePersonalHtml];
  if (!deptSameAsPersonal && effectiveDeptHtml.includes('openmd2')) htmlsToScan.push(effectiveDeptHtml);

  if (effectivePersonalHtml.includes('openmd2')) {
    const allEventsByHtml = htmlsToScan.map(h => extractHerzliyaEventIds(h));
    // Merge: dept events take precedence for production name (dept view has fuller names)
    const eventMap = new Map<number, { herzliyaId: number; name: string }>();
    for (const evList of allEventsByHtml) {
      for (const ev of evList) eventMap.set(ev.herzliyaId, ev);
    }
    const events = [...eventMap.values()];
    debugLines.push(`events:${events.length}(pers=${allEventsByHtml[0].length},dept=${allEventsByHtml[1]?.length ?? 0}),names:${events.slice(0,6).map(e=>e.name.slice(0,25)).join('|')}`);

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
          const u = new URL(effectivePopupBaseUrl);
          u.searchParams.set('appname', 'HsILWeb');
          u.searchParams.set('prgname', 'ShowCrew');
          u.searchParams.set('arguments', magicXpaSession ? `${magicXpaSession}-N${id}` : `-N${id}`);
          popupUrl = u.toString();
        } catch {
          popupUrl = buildHerzliyaPopupUrl(effectivePopupBaseUrl, id);
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
                const fallbackUrl = buildHerzliyaPopupUrl(effectivePopupBaseUrl, id);
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

    // Also rebuild from events when parseScheduleHTML found only generic "הפקה" names
    // (this happens with ShowEmp3 HTML which has openmd2 but different name format)
    const allGenericNames = parsed.productions.length > 0 && parsed.productions.every(p => p.name === 'הפקה');
    if (parsed.productions.length === 0 || allGenericNames) {
      if (allGenericNames) parsed.productions.splice(0);
      const seenIds = new Set<number>();
      let builtIdx = 0;
      let skippedGeneric = 0;
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
        let name = studioM ? nameNoRole.replace(studioM[0], '').replace(/\s{2,}/g, ' ').trim() : nameNoRole;

        // When event name resolves to just a role suffix (e.g. "הפקה"), try popup header for real name
        if (!name || name === 'הפקה') {
          const popupName = popupHtml ? extractNameFromPopup(popupHtml) : '';
          if (popupName && popupName !== 'הפקה') {
            name = popupName;
          } else {
            // No recoverable name — skip to avoid polluting global_productions
            skippedGeneric++;
            debugLines.push(`skipGeneric:id=${event.herzliyaId},raw=${event.name.slice(0,30)}`);
            continue;
          }
        }

        const popupCrew = popupHtml ? parseHerzliyaPopupHtml(popupHtml) : [];
        const crew: CrewMember[] = popupCrew.map(pc => ({
          name: pc.name, role: pc.role, roleDetail: '', phone: pc.phone,
          startTime: pc.startTime, endTime: pc.endTime, isCurrentUser: false,
        }));
        // Derive production start/end from crew shift times (Herzliya: endTime=shiftStart, startTime=shiftEnd)
        const shiftStarts = crew.map(c => c.endTime).filter(Boolean).sort();
        const shiftEnds = crew.map(c => c.startTime).filter(Boolean).sort();
        parsed.productions.push({
          id: String(event.herzliyaId),
          name,
          studio,
          date,
          day: getHebrewDay(date),
          startTime: shiftEnds.length ? shiftEnds[shiftEnds.length - 1] : '',
          endTime: shiftStarts.length ? shiftStarts[0] : '',
          status: 'scheduled',
          crew,
          herzliyaId: event.herzliyaId,
        } as Production);
      }
      debugLines.push(`builtFromEvents:${parsed.productions.length},skipped:${skippedGeneric}`);
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
