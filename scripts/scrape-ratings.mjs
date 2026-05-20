/**
 * scrape-ratings.mjs
 * Runs inside GitHub Actions.
 * Uses ScraperAPI to route requests through Israeli residential IPs,
 * bypassing Safenet's IP-level blocking on midrug.safenet.co.il.
 * Free tier: 5000 credits/month — daily scrape uses ~30/month.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const cheerio = require('cheerio');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const MIDRUG_AJAX_URL = 'https://midrug.safenet.co.il/ajax_info.asp';
const MIDRUG_APP_URL  = 'https://midrug.safenet.co.il/app/';
const SCRAPERAPI_KEY  = process.env.SCRAPERAPI_KEY || '';
const TIMEOUT_MS = 60_000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeWindows1255(text) {
  const hebrew  = (text.match(/[א-ת]/g) || []).length;
  const garbage = (text.match(/[×ש׳â€]/g) || []).length;
  if (hebrew > 0 || garbage === 0) return text;
  try {
    const bytes   = Uint8Array.from(text, c => c.charCodeAt(0));
    const decoded = new TextDecoder('windows-1255').decode(bytes);
    if ((decoded.match(/[א-ת]/g) || []).length > hebrew) return decoded;
  } catch {}
  return text;
}

async function fetchMidrug(postBody) {
  if (!SCRAPERAPI_KEY) throw new Error('SCRAPERAPI_KEY not configured');

  const bodyStr = postBody.toString();
  const proxyUrl = new URL('http://api.scraperapi.com/');
  proxyUrl.searchParams.set('api_key', SCRAPERAPI_KEY);
  proxyUrl.searchParams.set('url', MIDRUG_AJAX_URL);
  proxyUrl.searchParams.set('country_code', 'il');
  proxyUrl.searchParams.set('ultra_premium', 'true');
  proxyUrl.searchParams.set('render', 'false');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  console.log('  Sending via ScraperAPI (Israeli IP)...');
  try {
    const res = await fetch(proxyUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': MIDRUG_APP_URL,
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ScraperAPI HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    return decodeWindows1255(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(postBody, retries = 3) {
  const delays = [0, 20_000, 40_000];
  let lastErr;
  for (let i = 0; i < retries; i++) {
    if (delays[i]) {
      console.log(`  retry ${i}/${retries - 1} — waiting ${delays[i] / 1000}s...`);
      await sleep(delays[i]);
    }
    try { return await fetchMidrug(postBody); }
    catch (e) { lastErr = e; console.warn(`  attempt ${i + 1} failed: ${e.message}`); }
  }
  throw lastErr;
}

function parseRatingsTable(html, limit) {
  if (!html?.trim()) return [];
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) =>
      $(cell).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
    ).get();
    if (cells.length < 7) return;
    const rank      = Number(cells[0].replace(/[^\d.]/g, ''));
    const showName  = cells[1] || '';
    const channel   = cells[2] || '';
    const [dd, mm, yyyy] = (cells[4] || '').trim().split('/');
    const date      = (dd && mm && yyyy)
      ? `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` : '';
    const duration      = Number((cells[5] || '').replace(/[^\d.]/g, '')) || 0;
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
  const get = t => parts.find(p => p.type === t)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}
function prevDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d - 1, 12));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}
function toMidrugDate(y, m, d) { return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`; }
function toIsoDate(y, m, d)    { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

async function main() {
  const { year, month, day } = israelDateParts();
  const yesterday = prevDay(year, month, day);
  const dayBefore = prevDay(yesterday.year, yesterday.month, yesterday.day);

  const buildParams = (y, m, d) => new URLSearchParams({
    param: '81', ShowTable: '1', TheDate: toMidrugDate(y, m, d), Crowd: '1', tmp: String(Date.now()),
  });

  console.log(`Fetching ${toMidrugDate(yesterday.year, yesterday.month, yesterday.day)} via ScraperAPI (Israeli IP)...`);
  let html = await fetchWithRetry(buildParams(yesterday.year, yesterday.month, yesterday.day));
  let rows = parseRatingsTable(html, 20);
  let sourceDate = yesterday;
  let fallbackUsed = false;

  if (rows.length === 0) {
    console.log('No rows for yesterday, trying day before...');
    html = await fetchWithRetry(buildParams(dayBefore.year, dayBefore.month, dayBefore.day));
    rows = parseRatingsTable(html, 20);
    sourceDate = dayBefore;
    fallbackUsed = true;
  }

  if (rows.length === 0) throw new Error('No ratings rows parsed from either date');

  const isoDate   = toIsoDate(sourceDate.year, sourceDate.month, sourceDate.day);
  const fetchedAt = new Date().toISOString();

  await db.doc(`ratings_daily/${isoDate}`).set({
    date: isoDate,
    sourceDate: toMidrugDate(sourceDate.year, sourceDate.month, sourceDate.day),
    targetAudience: 'משקי בית בכלל האוכלוסייה',
    top20: rows,
    fallbackUsed,
    fetchedAt,
  }, { merge: true });

  await db.doc('adminMetrics/job-ratings-scrape').set({
    key: 'ratings-scrape',
    metricType: 'job',
    label: 'ratings-scrape',
    lastRunAt: fetchedAt,
    lastSuccessAt: fetchedAt,
    lastStatus: 'success',
    lastError: null,
    source: 'github-actions',
  }, { merge: true });

  console.log(`✓ Done. Saved ${rows.length} rows for ${isoDate} (fallbackUsed=${fallbackUsed})`);
  process.exit(0);
}

main().catch(err => {
  console.error('scrape-ratings failed:', err.message);
  db.doc('adminMetrics/job-ratings-scrape').set({
    key: 'ratings-scrape', metricType: 'job', label: 'ratings-scrape',
    lastRunAt: new Date().toISOString(), lastStatus: 'failure',
    lastError: err.message, source: 'github-actions',
  }, { merge: true }).catch(() => {}).finally(() => process.exit(1));
});
