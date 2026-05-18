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
const TARGET_AUDIENCE = 'משקי בית בכלל האוכלוסייה';
const TARGET_AUDIENCE_ID = '1';
const TZ = 'Asia/Jerusalem';
const MIDRUG_TIMEOUT_MS = 25_000;
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

async function fetchMidrugHtml(url: string, method: 'GET' | 'POST' = 'GET'): Promise<string> {
  const errors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MIDRUG_TIMEOUT_MS);
      const response = await fetch(url, {
        method,
        headers: MIDRUG_HEADERS,
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return decodeWindows1255(await response.arrayBuffer());
    } catch (error) {
      errors.push(`fetch#${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const allowInsecureTls of [false, true]) {
    try {
      const buffer = await requestMidrugBuffer(url, method, allowInsecureTls);
      return decodeWindows1255(buffer);
    } catch (error) {
      errors.push(`${allowInsecureTls ? 'https-insecure' : 'https'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const path = new URL(url).pathname;
  throw new Error(`Midrug fetch failed for ${path}: ${errors.join(' | ')}`);
}

function requestMidrugBuffer(urlString: string, method: 'GET' | 'POST', allowInsecureTls: boolean): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const requestImpl = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = requestImpl({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: { ...MIDRUG_HEADERS, Connection: 'close' },
      family: 4,
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

function israelDateAtUtcNoon(date: Date): Date {
  const parts = israelDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMidrugDate(date: Date): string {
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
        const contains = rowKey.length >= 4 && masterKey.length >= 4 && (rowKey.includes(masterKey) || masterKey.includes(rowKey));
        const score = contains ? 0.92 : stringSimilarity(rowKey, masterKey);
        if (score > (best?.score || 0)) best = { entry: candidate.entry, score };
      }
    }
  }
  return best && best.score >= 0.78 ? best.entry : null;
}

function enrichRows(rows: RatingRow[], entries: IndustryMasterEntry[]): { rows: RatingRow[]; matched: number; unmatched: number } {
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
  return fetchMidrugHtml(`${MIDRUG_AJAX_URL}?${params.toString()}`, 'POST');
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
  return fetchMidrugHtml(`${MIDRUG_AJAX_URL}?${params.toString()}`, 'POST');
}

function shouldRunWeekly(now: Date, forceWeekly: boolean): boolean {
  return forceWeekly || israelDateParts(now).weekday === 0;
}

export async function scrapeAndSaveRatings(options: ScrapeOptions = {}): Promise<RatingsScrapeResult> {
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

export async function getLatestRatingsDaily(): Promise<RatingsDailyDocument | null> {
  const docs = await listDocuments<RatingsDailyDocument>('ratings_daily').catch(() => []);
  return docs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
}

export async function getLatestRatingsWeekly(): Promise<RatingsWeeklyDocument | null> {
  const docs = await listDocuments<RatingsWeeklyDocument>('ratings_weekly').catch(() => []);
  return docs.sort((a, b) => String(b.fetchedAt || '').localeCompare(String(a.fetchedAt || '')))[0] || null;
}

export async function getRatingsJobStatus() {
  const metrics = await listDocuments<{
    key?: string;
    metricType?: string;
    lastRunAt?: string | null;
    lastSuccessAt?: string | null;
    lastStatus?: 'success' | 'failure' | null;
    lastError?: string | null;
  }>('adminMetrics').catch(() => []);
  return metrics.find((metric) => metric.metricType === 'job' && metric.key === 'ratings-scrape') || null;
}

export async function getRatingsDocumentByPath<T>(path: string): Promise<T | null> {
  return getDocument<T>(path);
}
