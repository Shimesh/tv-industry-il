/**
 * scrape-ratings.mjs
 * Runs inside GitHub Actions (ubuntu-latest).
 * GitHub runner IPs are not blocked by midrug.safenet.co.il.
 * We bypass the site's self-signed SSL cert with rejectUnauthorized:false.
 */

import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const cheerio = require('cheerio');

// ── Firebase init ─────────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ── Constants ─────────────────────────────────────────────────────────────────
const MIDRUG_AJAX_URL = 'https://midrug.safenet.co.il/ajax_info.asp';
const MIDRUG_APP_URL  = 'https://midrug.safenet.co.il/app/';
const TIMEOUT_MS = 15_000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  Referer: MIDRUG_APP_URL,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function decodeWindows1255(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  let win1255;
  try { win1255 = new TextDecoder('windows-1255').decode(buffer); } catch { return utf8; }
  const score = (s) => (s.match(/[֐-׿]/g) || []).length * 2 - (s.match(/[×׳�]/g) || []).length;
  return score(win1255) > score(utf8) ? win1255 : utf8;
}

function requestRaw(urlString, bodyStr, allowInsecureTls) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const reqImpl = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const bodyBuf = bodyStr ? Buffer.from(bodyStr, 'utf-8') : undefined;
    const headers = {
      ...HEADERS,
      Connection: 'close',
      ...(bodyBuf ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': bodyBuf.length } : {}),
    };
    const req = reqImpl({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method: 'POST', headers,
      timeout: TIMEOUT_MS, rejectUnauthorized: !allowInsecureTls,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`)); return;
        }
        const buf = Buffer.concat(chunks);
        resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function fetchMidrug(postBody) {
  const bodyStr = postBody.toString();
  const errors = [];
  // Try https strict → https insecure → http
  for (const [url, insecure] of [
    [MIDRUG_AJAX_URL, false],
    [MIDRUG_AJAX_URL, true],
    [MIDRUG_AJAX_URL.replace('https://', 'http://'), false],
  ]) {
    try {
      return decodeWindows1255(await requestRaw(url, bodyStr, insecure));
    } catch (e) {
      const label = url.startsWith('http://') ? 'http' : insecure ? 'https-insecure' : 'https';
      errors.push(`${label}: ${e.message}`);
      console.warn(`fetchMidrug ${label} failed:`, e.message);
    }
  }
  throw new Error(`Midrug unreachable: ${errors.join(' | ')}`);
}

function parseRatingsTable(html, limit) {
  if (!html.trim()) return [];
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) =>
      $(cell).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
    ).get();
    if (cells.length < 7) return;
    const rank = Number(cells[0].replace(/[^\d.]/g, ''));
    const showName = cells[1] || '';
    const channel  = cells[2] || '';
    const [dd, mm, yyyy] = (cells[4] || '').trim().split('/');
    const date = (dd && mm && yyyy) ? `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` : '';
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
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}

function prevDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d - 1, 12));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function toMidrugDate(y, m, d) {
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
}

function toIsoDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { year, month, day } = israelDateParts();
  const yesterday  = prevDay(year, month, day);
  const dayBefore  = prevDay(yesterday.year, yesterday.month, yesterday.day);

  const buildParams = (y, m, d) => new URLSearchParams({
    param: '81', ShowTable: '1', TheDate: toMidrugDate(y, m, d), Crowd: '1', tmp: String(Date.now()),
  });

  console.log('Fetching yesterday:', toMidrugDate(yesterday.year, yesterday.month, yesterday.day));
  let html = await fetchMidrug(buildParams(yesterday.year, yesterday.month, yesterday.day));
  let rows = parseRatingsTable(html, 20);
  let sourceDate = yesterday;
  let fallbackUsed = false;

  if (rows.length === 0) {
    console.log('No rows for yesterday, trying day before...');
    html = await fetchMidrug(buildParams(dayBefore.year, dayBefore.month, dayBefore.day));
    rows = parseRatingsTable(html, 20);
    sourceDate = dayBefore;
    fallbackUsed = true;
  }

  if (rows.length === 0) throw new Error('No ratings rows parsed from either date');

  const isoDate   = toIsoDate(sourceDate.year, sourceDate.month, sourceDate.day);
  const fetchedAt = new Date().toISOString();

  console.log(`Parsed ${rows.length} rows for ${isoDate}. Saving to Firestore...`);

  await db.doc(`ratings_daily/${isoDate}`).set({
    date: isoDate,
    sourceDate: toMidrugDate(sourceDate.year, sourceDate.month, sourceDate.day),
    targetAudience: 'משקי בית בכלל האוכלוסייה',
    top20: rows,
    fallbackUsed,
    fetchedAt,
  }, { merge: true });

  // Update admin metrics (visible in admin panel)
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

  console.log(`✓ Done. Saved ratings for ${isoDate} (${rows.length} rows, fallbackUsed=${fallbackUsed})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('scrape-ratings failed:', err.message);
  // Write failure to adminMetrics
  db.doc('adminMetrics/job-ratings-scrape').set({
    key: 'ratings-scrape',
    metricType: 'job',
    label: 'ratings-scrape',
    lastRunAt: new Date().toISOString(),
    lastStatus: 'failure',
    lastError: err.message,
    source: 'github-actions',
  }, { merge: true }).catch(() => {}).finally(() => process.exit(1));
});
