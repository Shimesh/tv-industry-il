/**
 * scrape-ratings.mjs
 * Runs inside GitHub Actions (ubuntu-latest).
 * Uses Puppeteer+Chromium so requests carry a real Chrome TLS fingerprint,
 * bypassing Safenet's bot-detection on midrug.safenet.co.il.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function decodeIfNeeded(text) {
  // Puppeteer returns strings; detect mojibake from windows-1255 mis-decoded as latin1
  const mojibake = (text.match(/[×ש׳â€]/g) || []).length;
  const hebrew   = (text.match(/[א-ת]/g) || []).length;
  if (hebrew > 0 || mojibake === 0) return text;
  // attempt to re-encode latin1 → windows-1255
  try {
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('windows-1255').decode(bytes);
    const hebrewAfter = (decoded.match(/[א-ת]/g) || []).length;
    if (hebrewAfter > hebrew) return decoded;
  } catch { /* ignore */ }
  return text;
}

async function launchBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

/**
 * Fetch midrug AJAX data by running a fetch() call from inside Chrome.
 * Chrome's TLS fingerprint passes Safenet's bot-detection; Node.js does not.
 */
async function fetchMidrugWithPuppeteer(postBody) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

    // Visit app page first to get session cookies
    console.log('  [puppeteer] visiting app page for session...');
    await page.goto(MIDRUG_APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Run AJAX call from within Chrome (carries real browser TLS fingerprint + cookies)
    console.log('  [puppeteer] posting AJAX request...');
    const bodyStr = postBody.toString();
    const result = await page.evaluate(async (url, body) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        if (!res.ok) return { ok: false, status: res.status, text: '' };
        const text = await res.text();
        return { ok: true, status: res.status, text };
      } catch (e) {
        return { ok: false, status: 0, text: '', error: String(e) };
      }
    }, MIDRUG_AJAX_URL, bodyStr);

    if (!result.ok) {
      throw new Error(result.error || `HTTP ${result.status}`);
    }
    return decodeIfNeeded(result.text);
  } finally {
    await browser.close();
  }
}

async function fetchMidrugWithRetry(postBody, retries = 3) {
  const delays = [0, 15_000, 30_000];
  let lastError;
  for (let i = 0; i < retries; i++) {
    if (delays[i]) {
      console.log(`  retry ${i}/${retries - 1} — waiting ${delays[i] / 1000}s...`);
      await sleep(delays[i]);
    }
    try {
      return await fetchMidrugWithPuppeteer(postBody);
    } catch (e) {
      lastError = e;
      console.warn(`  attempt ${i + 1} failed: ${e.message}`);
    }
  }
  throw lastError;
}

// ── Parsing ───────────────────────────────────────────────────────────────────
function parseRatingsTable(html, limit) {
  if (!html || !html.trim()) return [];
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

// ── Date helpers ──────────────────────────────────────────────────────────────
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
function toMidrugDate(y, m, d) { return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`; }
function toIsoDate(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { year, month, day } = israelDateParts();
  const yesterday = prevDay(year, month, day);
  const dayBefore = prevDay(yesterday.year, yesterday.month, yesterday.day);

  const buildParams = (y, m, d) => new URLSearchParams({
    param: '81', ShowTable: '1', TheDate: toMidrugDate(y, m, d), Crowd: '1', tmp: String(Date.now()),
  });

  console.log('Fetching yesterday:', toMidrugDate(yesterday.year, yesterday.month, yesterday.day));
  let html = await fetchMidrugWithRetry(buildParams(yesterday.year, yesterday.month, yesterday.day));
  let rows = parseRatingsTable(html, 20);
  let sourceDate = yesterday;
  let fallbackUsed = false;

  if (rows.length === 0) {
    console.log('No rows for yesterday, trying day before...');
    html = await fetchMidrugWithRetry(buildParams(dayBefore.year, dayBefore.month, dayBefore.day));
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

main().catch((err) => {
  console.error('scrape-ratings failed:', err.message);
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
