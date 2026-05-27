import * as cheerio from 'cheerio';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { normalizeName } from '@/lib/crewNormalization';
import { stripProductionSuffixes, stringSimilarity } from '@/lib/productionNameNormalization';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';
import type { RatingRow, RatingsDailyDocument, RatingsWeeklyDocument } from '@/lib/ratingsTypes';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';

const MIDRUG_APP_URL = 'https://midrug.safenet.co.il/app/';
const MIDRUG_AJAX_URL = 'https://midrug.safenet.co.il/ajax_info.asp';
const EDGE_PROXY_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/proxy/midrug`
  : process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/api/proxy/midrug`
    : 'http://localhost:3000/api/proxy/midrug';
const TARGET_AUDIENCE = 'משקי בית בכלל האוכלוסייה';
const TARGET_AUDIENCE_ID = '1';
const TZ = 'Asia/Jerusalem';
const MIDRUG_TIMEOUT_MS = 5_000;
const MIDRUG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/2.6.0; +https://tv-industry-il.vercel.app)',
  Accept: 'text/html,application/xhtml+xml,*/*',
  Referer: MIDRUG_APP_URL,
};

type MasterIndexEntry = {
  entry: IndustryMasterEntry;
  keys: Set<string>;
};

type ScrapeOptions = {
  forceWeekly?: boolean;
  now?: Date;
  allowCachedFallback?: boolean;
};

export type RatingsScrapeResult = {
  daily: {
    date: string;
    sourceDate: string;
    fallbackUsed: boolean;
    rows: number;
    matched: number;
    unmatched: number;
  };
  weekly?: {
    weekId: string;
    weekRange: string;
    rows: number;
    matched: number;
    unmatched: number;
  };
  cachedFallback?: boolean;
  warning?: string;
};

function decodeWindows1255(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  let win1255 = utf8;
  try {
    win1255 = new TextDecoder('windows-1255').decode(buffer);
  } catch {
    return utf8;
  }

  const score = (value: string) => {
    const hebrew = (value.match(/[\u0590-\u05ff]/g) || []).length;
    const mojibake = (value.match(/[×׳�]/g) || []).length;
    return hebrew * 2 - mojibake;
  };

  return score(win1255) > score(utf8) ? win1255 : utf8;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMidrugHtml(baseUrl: string, method: 'GET' | 'POST' = 'GET', postBody?: URLSearchParams): Promise<string> {
  const url = method === 'GET' && postBody ? `${baseUrl}?${postBody.toString()}` : baseUrl;
  const bodyStr = method === 'POST' && postBody ? postBody.toString() : undefined;
  const headers: Record<string, string> = { ...MIDRUG_HEADERS };
  if (bodyStr) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const errors: string[] = [];
  const path = new URL(url).pathname;
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[midrug ${path}] +${Date.now()-t0}ms ${msg}`);

  const backoffs = [0, 2000];
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt]) await sleep(backoffs[attempt]);
    log(`fetch#${attempt + 1} start`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MIDRUG_TIMEOUT_MS);
      const response = await fetch(url, { method, headers, body: bodyStr, cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      log(`fetch#${attempt + 1} OK ${response.status}`);
      return decodeWindows1255(await response.arrayBuffer());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`fetch#${attempt + 1}: ${msg}`);
      log(`fetch#${attempt + 1} FAIL ${msg}`);
    }
  }

  for (const allowInsecureTls of [false, true]) {
    const label = allowInsecureTls ? 'https-insecure' : 'https';
    log(`${label} start`);
    try {
      const buffer = await requestMidrugBuffer(url, method, bodyStr, allowInsecureTls);
      log(`${label} OK`);
      return decodeWindows1255(buffer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${label}: ${msg}`);
      log(`${label} FAIL ${msg}`);
    }
  }

  log('http start');
  try {
    const httpUrl = url.replace('https://', 'http://');
    const buffer = await requestMidrugBuffer(httpUrl, method, bodyStr, false);
    log('http OK');
    return decodeWindows1255(buffer);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`http: ${msg}`);
    log(`http FAIL ${msg}`);
  }

  log('edge-proxy start');
  try {
    const parsedUrl = new URL(url);
    const edgeParams = new URLSearchParams({ path: parsedUrl.pathname, params: parsedUrl.search.slice(1) });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MIDRUG_TIMEOUT_MS);
    const response = await fetch(`${EDGE_PROXY_BASE}?${edgeParams}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) { log('edge-proxy OK'); return decodeWindows1255(await response.arrayBuffer()); }
    throw new Error(`edge-proxy HTTP ${response.status}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`edge-proxy: ${msg}`);
    log(`edge-proxy FAIL ${msg}`);
  }

  const proxies = [
    { label: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
    { label: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  ];
  for (const proxy of proxies) {
    log(`${proxy.label} start`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MIDRUG_TIMEOUT_MS);
      const response = await fetch(proxy.url, { method: 'GET', cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`proxy HTTP ${response.status}`);
      log(`${proxy.label} OK`);
      return decodeWindows1255(await response.arrayBuffer());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${proxy.label}: ${msg}`);
      log(`${proxy.label} FAIL ${msg}`);
    }
  }

  log(`all methods failed: ${errors.join(' | ')}`);
  throw new Error(`Midrug fetch failed for ${path}: ${errors.join(' | ')}`);
}

function requestMidrugBuffer(urlString: string, method: 'GET' | 'POST', postBodyStr: string | undefined, allowInsecureTls: boolean): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const requestImpl = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const bodyBuf = postBodyStr ? Buffer.from(postBodyStr, 'utf-8') : undefined;
    const headers: Record<string, string | number> = { ...MIDRUG_HEADERS, Connection: 'close' };
    if (bodyBuf) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = bodyBuf.length;
    }
    const req = requestImpl({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      timeout: MIDRUG_TIMEOUT_MS,
      rejectUnauthorized: !allowInsecureTls,
    }, (res) => {
      const status = res.statusCode || 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const buffer = Buffer.concat(chunks);
        resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function israelDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdays[get('weekday')] ?? date.getUTCDay(),
  };
}

export function israelDateAtUtcNoon(date: Date): Date {
  const parts = israelDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toMidrugDate(date: Date): string {
  const iso = toIsoDate(date);
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function midrugDateToIso(value: string): string {
  const [day, month, year] = value.trim().split('/');
  if (!day || !month || !year) return value.trim();
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanCell(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseRatingsTable(html: string, limit: number): RatingRow[] {
  if (!html.trim()) return [];
  const $ = cheerio.load(html);
  const rows: RatingRow[] = [];

  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) => cleanCell($(cell).text())).get();
    if (cells.length < 7) return;
    const rank = parseNumber(cells[0]);
    const showName = cells[1] || '';
    const channel = cells[2] || '';
    const date = midrugDateToIso(cells[4] || '');
    const duration = parseNumber(cells[5] || '');
    const ratingPercent = parseNumber(cells[6] || '');
    if (!rank || !showName || !channel || !date) return;
    rows.push({ rank, showName, channel, date, duration, ratingPercent });
  });

  return rows.slice(0, limit);
}

function normalizedCandidates(rawName: string): string[] {
  const withoutSuffix = stripProductionSuffixes(rawName);
  const withoutTrailingChannel = withoutSuffix
    .replace(/\s+(?:11|12|13|14|15)$/u, '')
    .replace(/\s+-\s*(?:כאן|קשת|רשת|עכשיו|ערוץ)?\s*\d+$/u, '')
    .trim();
  return Array.from(new Set([rawName, withoutSuffix, withoutTrailingChannel].map(normalizeName).filter(Boolean)));
}

function buildMasterIndex(entries: IndustryMasterEntry[]): MasterIndexEntry[] {
  return entries.map((entry) => {
    const names = [
      entry.showName,
      entry.masterName || '',
      ...(Array.isArray(entry.variations) ? entry.variations : []),
    ].filter(Boolean);
    return {
      entry,
      keys: new Set(names.flatMap(normalizedCandidates)),
    };
  });
}

function findMasterMatch(row: RatingRow, index: MasterIndexEntry[]): IndustryMasterEntry | null {
  const rowKeys = normalizedCandidates(row.showName);
  for (const candidate of index) {
    if (rowKeys.some((key) => candidate.keys.has(key))) return candidate.entry;
  }

  let best: { entry: IndustryMasterEntry; score: number } | null = null;
  for (const candidate of index) {
    for (const rowKey of rowKeys) {
      for (const masterKey of candidate.keys) {
        const contains = rowKey.length >= 4 && masterKey.length >= 4 && rowKey.includes(masterKey);
        const score = contains ? 0.92 : stringSimilarity(rowKey, masterKey);
        if (score > (best?.score || 0)) best = { entry: candidate.entry, score };
      }
    }
  }
  return best && best.score >= 0.78 ? best.entry : null;
}

export function enrichRows(rows: RatingRow[], entries: IndustryMasterEntry[]): { rows: RatingRow[]; matched: number; unmatched: number } {
  const index = buildMasterIndex(entries);
  let matched = 0;
  let unmatched = 0;
  const enriched = rows.map((row) => {
    const master = findMasterMatch(row, index);
    if (!master) {
      unmatched++;
      return row;
    }
    matched++;
    const logoUrl = master.logoUrl && master.logoUrl !== 'none' && master.wikiTitleMatch !== 'needs_review'
      ? master.logoUrl
      : '';
    const channelTags = Array.from(new Set([row.channel, master.network].filter(Boolean)));
    return {
      ...row,
      masterEntryId: master.id,
      canonicalShowName: master.masterName || master.showName,
      logoUrl,
      channelTags,
    };
  });
  return { rows: enriched, matched, unmatched };
}

async function fetchDailyHtml(date: Date): Promise<string> {
  const params = new URLSearchParams({
    param: '81',
    ShowTable: '1',
    TheDate: toMidrugDate(date),
    Crowd: TARGET_AUDIENCE_ID,
    tmp: String(Date.now()),
  });
  return fetchMidrugHtml(MIDRUG_AJAX_URL, 'POST', params);
}

async function fetchWeeklyOptions(): Promise<Array<{ id: string; label: string }>> {
  const html = await fetchMidrugHtml(MIDRUG_APP_URL);
  const $ = cheerio.load(html);
  return $('#TheWeek option').map((_, option) => ({
    id: cleanCell($(option).attr('value') || ''),
    label: cleanCell($(option).text()),
  })).get().filter((option) => option.id && option.id !== '0' && option.label);
}

async function fetchWeeklyHtml(weekId: string): Promise<string> {
  const params = new URLSearchParams({
    param: '82',
    ShowTable: '2',
    TheWeek: weekId,
    Crowd: TARGET_AUDIENCE_ID,
    tmp: String(Date.now()),
  });
  return fetchMidrugHtml(MIDRUG_AJAX_URL, 'POST', params);
}

function shouldRunWeekly(now: Date, forceWeekly: boolean): boolean {
  // Run on Sunday (weekday=0) and Monday (weekday=1) to catch weekly data
  // published on Midrug after Sunday morning's cron has already run.
  const weekday = israelDateParts(now).weekday;
  return forceWeekly || weekday === 0 || weekday === 1;
}

async function buildCachedRatingsFallback(error: unknown, includeWeekly: boolean): Promise<RatingsScrapeResult> {
  const [daily, weekly] = await Promise.all([
    getLatestRatingsDaily(),
    includeWeekly ? getLatestRatingsWeekly() : Promise.resolve(null),
  ]);
  if (!daily) throw error;

  const countMatches = (rows: RatingRow[]) => rows.reduce(
    (acc, row) => {
      if (row.masterEntryId) acc.matched += 1;
      else acc.unmatched += 1;
      return acc;
    },
    { matched: 0, unmatched: 0 },
  );
  const dailyCounts = countMatches(daily.top20 || []);
  const result: RatingsScrapeResult = {
    daily: {
      date: daily.date,
      sourceDate: daily.sourceDate || daily.date,
      fallbackUsed: Boolean(daily.fallbackUsed),
      rows: daily.top20?.length || 0,
      matched: dailyCounts.matched,
      unmatched: dailyCounts.unmatched,
    },
    cachedFallback: true,
    warning: error instanceof Error ? error.message : 'Ratings source is temporarily unavailable',
  };

  if (weekly) {
    const weeklyCounts = countMatches(weekly.top25 || []);
    result.weekly = {
      weekId: weekly.weekId || weekly.weekRange,
      weekRange: weekly.weekRange,
      rows: weekly.top25?.length || 0,
      matched: weeklyCounts.matched,
      unmatched: weeklyCounts.unmatched,
    };
  }

  return result;
}

async function scrapeAndSaveRatingsFresh(options: ScrapeOptions = {}): Promise<RatingsScrapeResult> {
  const now = options.now || new Date();
  const today = israelDateAtUtcNoon(now);
  const yesterday = addDays(today, -1);
  const previousDay = addDays(today, -2);
  const masterEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

  let sourceDate = yesterday;
  let dailyRows = parseRatingsTable(await fetchDailyHtml(sourceDate), 20);
  let fallbackUsed = false;
  if (dailyRows.length === 0) {
    sourceDate = previousDay;
    fallbackUsed = true;
    dailyRows = parseRatingsTable(await fetchDailyHtml(sourceDate), 20);
  }
  if (dailyRows.length === 0) {
    throw new Error('No daily ratings were returned for yesterday or the fallback date');
  }

  const dailyEnriched = enrichRows(dailyRows, masterEntries);
  const fetchedAt = new Date().toISOString();
  const dailyDoc: RatingsDailyDocument = {
    date: toIsoDate(sourceDate),
    sourceDate: toMidrugDate(sourceDate),
    targetAudience: TARGET_AUDIENCE,
    top20: dailyEnriched.rows,
    fallbackUsed,
    fetchedAt,
  };
  await patchDocument(`ratings_daily/${dailyDoc.date}`, dailyDoc as unknown as Record<string, never>);

  const result: RatingsScrapeResult = {
    daily: {
      date: dailyDoc.date,
      sourceDate: dailyDoc.sourceDate || dailyDoc.date,
      fallbackUsed,
      rows: dailyEnriched.rows.length,
      matched: dailyEnriched.matched,
      unmatched: dailyEnriched.unmatched,
    },
  };

  if (shouldRunWeekly(now, Boolean(options.forceWeekly))) {
    const latestWeek = (await fetchWeeklyOptions()).at(-1);
    if (!latestWeek) throw new Error('No weekly ratings options were found');
    const weeklyRows = parseRatingsTable(await fetchWeeklyHtml(latestWeek.id), 25);
    if (weeklyRows.length === 0) throw new Error(`No weekly ratings were returned for week ${latestWeek.label}`);
    const weeklyEnriched = enrichRows(weeklyRows, masterEntries);
    const weeklyDoc: RatingsWeeklyDocument = {
      weekId: latestWeek.id,
      weekRange: latestWeek.label,
      targetAudience: TARGET_AUDIENCE,
      top25: weeklyEnriched.rows,
      fetchedAt,
    };
    await patchDocument(`ratings_weekly/week-${latestWeek.id}`, weeklyDoc as unknown as Record<string, never>);
    result.weekly = {
      weekId: latestWeek.id,
      weekRange: latestWeek.label,
      rows: weeklyEnriched.rows.length,
      matched: weeklyEnriched.matched,
      unmatched: weeklyEnriched.unmatched,
    };
  }

  return result;
}

export async function scrapeAndSaveRatings(options: ScrapeOptions = {}): Promise<RatingsScrapeResult> {
  try {
    return await scrapeAndSaveRatingsFresh(options);
  } catch (error) {
    if (options.allowCachedFallback) {
      return buildCachedRatingsFallback(error, shouldRunWeekly(options.now || new Date(), Boolean(options.forceWeekly)));
    }
    throw error;
  }
}

export async function getLatestRatingsDaily(): Promise<RatingsDailyDocument | null> {
  const docs = await listDocuments<RatingsDailyDocument>('ratings_daily').catch(() => []);
  const byDate = [...docs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const latest = byDate[0] || null;
  const latestMidrug = byDate.find((doc) => (
    doc.source !== 'telegram' &&
    (doc.top20 ?? []).some((row) => Boolean(row.date && row.channel && row.duration > 0))
  )) || null;
  const latestTelegram = byDate.find((doc) => (
    (doc.telegramHouseholds?.length ?? 0) > 0 ||
    (doc.telegramPrime?.length ?? 0) > 0
  )) || null;

  if (latestMidrug && latestTelegram) {
    const targetDate = String(latestTelegram.date || latestMidrug.date);
    const sameDateMidrug = String(latestMidrug.date || '') === targetDate;
    return {
      ...latestMidrug,
      date: targetDate,
      top20: sameDateMidrug ? latestMidrug.top20 ?? [] : [],
      telegramHouseholds: latestTelegram.telegramHouseholds ?? [],
      telegramPrime: latestTelegram.telegramPrime ?? [],
      telegramFetchedAt: latestTelegram.telegramFetchedAt,
      source: sameDateMidrug ? 'both' : 'telegram',
    };
  }

  return latestMidrug || latestTelegram || latest;
}

export async function getLatestRatingsWeekly(): Promise<RatingsWeeklyDocument | null> {
  const docs = await listDocuments<RatingsWeeklyDocument>('ratings_weekly').catch(() => []);
  return docs.sort((a, b) => String(b.fetchedAt || '').localeCompare(String(a.fetchedAt || '')))[0] || null;
}

export async function getRatingsJobStatus() {
  const metrics = await listDocuments<{
    key?: string;
    metricType?: string;
    source?: string;
    lastRunAt?: string | null;
    lastSuccessAt?: string | null;
    lastStatus?: 'running' | 'success' | 'failure' | null;
    lastError?: string | null;
  }>('adminMetrics').catch(() => []);
  const all = metrics.filter((m) => (
    m.metricType === 'job' &&
    ['ratings-midrug-scrape', 'ratings-telegram-scopt', 'ratings-scrape'].includes(String(m.key || ''))
  ));
  if (!all.length) return null;

  // Most recently run document drives status/error display
  const byRun = [...all].sort((a, b) => String(b.lastRunAt || '').localeCompare(String(a.lastRunAt || '')));
  // Best success from any document (covers cross-source history)
  const bestSuccess = [...all]
    .filter((m) => m.lastSuccessAt)
    .sort((a, b) => String(b.lastSuccessAt || '').localeCompare(String(a.lastSuccessAt || '')))[0];

  return { ...byRun[0], lastSuccessAt: bestSuccess?.lastSuccessAt ?? byRun[0].lastSuccessAt ?? null };
}

export async function getRatingsDocumentByPath<T>(path: string): Promise<T | null> {
  return getDocument<T>(path);
}
