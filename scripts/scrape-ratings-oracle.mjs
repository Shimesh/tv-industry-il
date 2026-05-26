/**
 * scrape-ratings-oracle.mjs
 * Runs on Oracle VM (Israeli IP) — not blocked by midrug.safenet.co.il.
 * Simple Node.js fetch, no Puppeteer needed.
 *
 * Setup:
 *   1. Install: npm install firebase-admin cheerio
 *   2. Create .env with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   3. Cron (10:15 IST = 07:15 UTC): 15 7 * * * cd ~/ratings-scraper && node scrape-ratings-oracle.mjs >> ~/ratings.log 2>&1
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);

// Load .env from project root using Node 20+ built-in (handles BOM, CRLF, Windows paths)
try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch { /* .env optional */ }

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
const TIMEOUT_MS = 20_000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  Referer: MIDRUG_APP_URL,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeWindows1255(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  let win1255;
  try { win1255 = new TextDecoder('windows-1255').decode(buffer); } catch { return utf8; }
  const score = s => (s.match(/[א-ת]/g)||[]).length * 2 - (s.match(/[×׳]/g)||[]).length;
  return score(win1255) > score(utf8) ? win1255 : utf8;
}

async function fetchMidrug(postBody) {
  const bodyStr = postBody.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MIDRUG_AJAX_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return decodeWindows1255(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
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
    const rank = Number(cells[0].replace(/[^\d.]/g, ''));
    const showName = cells[1] || '';
    const channel  = cells[2] || '';
    const [dd, mm, yyyy] = (cells[4]||'').trim().split('/');
    const date = (dd&&mm&&yyyy) ? `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` : '';
    const duration      = Number((cells[5]||'').replace(/[^\d.]/g,'')) || 0;
    const ratingPercent = Number((cells[6]||'').replace(/[^\d.]/g,'')) || 0;
    if (!rank||!showName||!channel||!date) return;
    rows.push({ rank, showName, channel, date, duration, ratingPercent });
  });
  return rows.slice(0, limit);
}

function israelDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '';
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdays[get('weekday')] ?? new Date().getUTCDay(),
  };
}
function prevDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m-1, d-1, 12));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth()+1, day: dt.getUTCDate() };
}
function toMidrugDate(y, m, d) { return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`; }
function toIsoDate(y, m, d)    { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

async function fetchMidrugGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return decodeWindows1255(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWeeklyOptions() {
  const html = await fetchMidrugGet(MIDRUG_APP_URL);
  const $ = cheerio.load(html);
  return $('#TheWeek option')
    .map((_, el) => ({ id: $(el).attr('value')?.trim() || '', label: $(el).text().replace(/\s+/g, ' ').trim() }))
    .get()
    .filter(o => o.id && o.id !== '0' && o.label);
}

async function main() {
  // Check Firestore for a pending manual sync request
  let forceWeekly = process.env.FORCE_WEEKLY === '1';
  try {
    const snap = await db.doc('appConfig/global').get();
    const cfg = snap.data() || {};
    if (cfg.ratingsSyncRequested) {
      console.log(`[${new Date().toISOString()}] Manual sync requested — running with FORCE_WEEKLY=1`);
      forceWeekly = true;
      await db.doc('appConfig/global').update({
        ratingsSyncRequested: false,
        ratingsSyncInProgress: true,
        ratingsSyncStartedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('Could not read appConfig/global:', e.message);
  }

  const { year, month, day, weekday } = israelDateParts();
  const yesterday = prevDay(year, month, day);
  const dayBefore = prevDay(yesterday.year, yesterday.month, yesterday.day);

  const buildParams = (y, m, d) => new URLSearchParams({
    param: '81', ShowTable: '1', TheDate: toMidrugDate(y, m, d), Crowd: '1', tmp: String(Date.now()),
  });

  console.log(`[${new Date().toISOString()}] Fetching ${toMidrugDate(yesterday.year, yesterday.month, yesterday.day)}...`);
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

  if (rows.length === 0) throw new Error('No ratings rows parsed');

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

  await db.doc('adminMetrics/job-ratings-midrug-scrape').set({
    key: 'ratings-midrug-scrape',
    metricType: 'job',
    label: 'ratings-midrug-scrape',
    lastRunAt: fetchedAt,
    lastSuccessAt: fetchedAt,
    lastStatus: 'success',
    lastError: null,
    lastMessage: `Midrug Oracle saved ${rows.length} rows`,
    lastDetail: JSON.stringify({ source: 'midrug', trigger: 'oracle-vm', dailyDate: isoDate, dailyRows: rows.length, fallbackUsed }),
    source: 'oracle-vm',
  }, { merge: true });

  console.log(`✓ Daily: saved ${rows.length} rows for ${isoDate} (fallback=${fallbackUsed})`);

  if (forceWeekly || weekday === 0 || weekday === 1) {
    console.log(`\n[${new Date().toISOString()}] Fetching weekly ratings (weekday=${weekday})...`);
    try {
      const weeklyOptions = await fetchWeeklyOptions();
      const latestWeek = weeklyOptions.at(-1);
      if (!latestWeek) throw new Error('No weekly options in Midrug dropdown');

      console.log(`  Latest week: id=${latestWeek.id} label="${latestWeek.label}"`);
      const weeklyParams = new URLSearchParams({
        param: '82', ShowTable: '2', TheWeek: latestWeek.id, Crowd: '1', tmp: String(Date.now()),
      });
      const weeklyHtml = await fetchMidrug(weeklyParams);
      const weeklyRows = parseRatingsTable(weeklyHtml, 25);
      if (weeklyRows.length === 0) throw new Error(`No rows for week ${latestWeek.label}`);

      await db.doc(`ratings_weekly/week-${latestWeek.id}`).set({
        weekId: latestWeek.id,
        weekRange: latestWeek.label,
        targetAudience: 'משקי בית בכלל האוכלוסייה',
        top25: weeklyRows,
        fetchedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`✓ Weekly: saved ${weeklyRows.length} rows for ${latestWeek.label}`);
    } catch (weeklyErr) {
      console.warn(`⚠ Weekly failed (non-fatal): ${weeklyErr.message}`);
    }
  }

  // Clear manual sync flag if it was set
  await db.doc('appConfig/global').update({
    ratingsSyncInProgress: false,
    ratingsSyncLastTriggeredAt: new Date().toISOString(),
    ratingsSyncLastStatus: 'success',
  }).catch(() => {});

  process.exit(0);
}

main().catch(err => {
  console.error(`✗ Failed: ${err.message}`);
  db.doc('adminMetrics/job-ratings-midrug-scrape').set({
    key: 'ratings-midrug-scrape', metricType: 'job', label: 'ratings-midrug-scrape',
    lastRunAt: new Date().toISOString(), lastStatus: 'failure',
    lastError: err.message, lastMessage: 'Midrug Oracle failed', source: 'oracle-vm',
  }, { merge: true }).catch(() => {}).finally(() => process.exit(1));
});
