import { onRequest, onSchedule } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as cheerio from 'cheerio';

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: 'me-west1', timeoutSeconds: 60 });

const MIDRUG_AJAX_URL = 'https://midrug.safenet.co.il/ajax_info.asp';
const MIDRUG_APP_URL = 'https://midrug.safenet.co.il/app/';
const TIMEOUT_MS = 20000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  'Referer': MIDRUG_APP_URL,
};

function decodeWindows1255(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  let win1255;
  try { win1255 = new TextDecoder('windows-1255').decode(buffer); } catch { return utf8; }
  const score = (s) => (s.match(/[֐-׿]/g) || []).length * 2 - (s.match(/[×׳�]/g) || []).length;
  return score(win1255) > score(utf8) ? win1255 : utf8;
}

async function fetchMidrug(url, postBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const bodyStr = postBody ? postBody.toString() : undefined;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, ...(bodyStr ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: bodyStr,
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return decodeWindows1255(await res.arrayBuffer());
}

function parseRatingsTable(html, limit) {
  if (!html.trim()) return [];
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) => $(cell).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim()).get();
    if (cells.length < 7) return;
    const rank = Number(cells[0].replace(/[^\d.]/g, ''));
    const showName = cells[1] || '';
    const channel = cells[2] || '';
    const [dd, mm, yyyy] = (cells[4] || '').trim().split('/');
    const date = (dd && mm && yyyy) ? `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : '';
    const duration = Number((cells[5] || '').replace(/[^\d.]/g, '')) || 0;
    const ratingPercent = Number((cells[6] || '').replace(/[^\d.]/g, '')) || 0;
    if (!rank || !showName || !channel || !date) return;
    rows.push({ rank, showName, channel, date, duration, ratingPercent });
  });
  return rows.slice(0, limit);
}

function israelDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}

function toMidrugDate(y, m, d) {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function toIsoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function prevDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d - 1, 12));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

async function scrapeAndSave() {
  const { year, month, day } = israelDateParts();
  const yesterday = prevDay(year, month, day);
  const dayBefore = prevDay(yesterday.year, yesterday.month, yesterday.day);

  let sourceDate = yesterday;
  let fallbackUsed = false;

  const buildParams = (y, m, d) => new URLSearchParams({
    param: '81', ShowTable: '1', TheDate: toMidrugDate(y, m, d), Crowd: '1', tmp: String(Date.now()),
  });

  let html = await fetchMidrug(MIDRUG_AJAX_URL, buildParams(yesterday.year, yesterday.month, yesterday.day));
  let rows = parseRatingsTable(html, 20);

  if (rows.length === 0) {
    sourceDate = dayBefore;
    fallbackUsed = true;
    html = await fetchMidrug(MIDRUG_AJAX_URL, buildParams(dayBefore.year, dayBefore.month, dayBefore.day));
    rows = parseRatingsTable(html, 20);
  }

  if (rows.length === 0) throw new Error('No ratings rows parsed');

  const isoDate = toIsoDate(sourceDate.year, sourceDate.month, sourceDate.day);
  const fetchedAt = new Date().toISOString();

  await db.doc(`ratings_daily/${isoDate}`).set({
    date: isoDate,
    sourceDate: toMidrugDate(sourceDate.year, sourceDate.month, sourceDate.day),
    targetAudience: 'משקי בית בכלל האוכלוסייה',
    top20: rows,
    fallbackUsed,
    fetchedAt,
  }, { merge: true });

  await db.doc('adminMetrics/ratings-scrape').set({
    key: 'ratings-scrape',
    metricType: 'job',
    lastRunAt: fetchedAt,
    lastSuccessAt: fetchedAt,
    lastStatus: 'success',
    lastError: null,
  }, { merge: true });

  return { date: isoDate, rows: rows.length, fallbackUsed };
}

export const scrapeRatings = onRequest({ cors: true }, async (req, res) => {
  try {
    const result = await scrapeAndSave();
    res.json({ success: true, ...result, region: 'me-west1' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.doc('adminMetrics/ratings-scrape').set({
      key: 'ratings-scrape',
      metricType: 'job',
      lastRunAt: new Date().toISOString(),
      lastStatus: 'failure',
      lastError: message,
    }, { merge: true }).catch(() => {});
    res.status(500).json({ success: false, error: message });
  }
});

export const scrapeRatingsScheduled = onSchedule('every day 07:15', async () => {
  try {
    const result = await scrapeAndSave();
    console.log('Ratings scrape success:', result);
  } catch (error) {
    console.error('Ratings scrape failed:', error);
    await db.doc('adminMetrics/ratings-scrape').set({
      key: 'ratings-scrape',
      metricType: 'job',
      lastRunAt: new Date().toISOString(),
      lastStatus: 'failure',
      lastError: error instanceof Error ? error.message : String(error),
    }, { merge: true }).catch(() => {});
  }
});
