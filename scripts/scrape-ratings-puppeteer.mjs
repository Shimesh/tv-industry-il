/**
 * scrape-ratings-puppeteer.mjs
 * Uses Puppeteer to open Midrug like a real browser, select the weekly ratings,
 * grab the full page text (simulating Ctrl+A + copy), then parse and save to Firebase.
 *
 * Run: node scripts/scrape-ratings-puppeteer.mjs
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);

try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch { /* .env optional */ }

const puppeteer = require('puppeteer');
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

const MIDRUG_APP_URL = 'https://midrug.safenet.co.il/app/';

function parseRatingsTable(html, limit) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) =>
      $(cell).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
    ).get();
    if (cells.length < 7) return;
    const rank = Number(cells[0].replace(/[^\d.]/g, ''));
    const showName = cells[1] || '';
    const channel = cells[2] || '';
    const [dd, mm, yyyy] = (cells[4] || '').trim().split('/');
    const date = (dd && mm && yyyy)
      ? `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      : '';
    const duration = Number((cells[5] || '').replace(/[^\d.]/g, '')) || 0;
    const ratingPercent = Number((cells[6] || '').replace(/[^\d.]/g, '')) || 0;
    if (!rank || !showName || !channel || !date) return;
    rows.push({ rank, showName, channel, date, duration, ratingPercent });
  });
  return rows.slice(0, limit);
}

async function main() {
  const forceWeekly = process.env.FORCE_WEEKLY === '1';
  console.log(`[${new Date().toISOString()}] Launching Puppeteer... forceWeekly=${forceWeekly}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    // ── Load the Midrug app page ──
    console.log(`[${new Date().toISOString()}] Navigating to Midrug...`);
    await page.goto(MIDRUG_APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // ── Scrape daily ratings (yesterday) ──
    console.log(`[${new Date().toISOString()}] Fetching daily ratings...`);
    const dailyHtml = await page.evaluate(() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dd = String(yesterday.getDate()).padStart(2, '0');
      const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yyyy = yesterday.getFullYear();
      const dateStr = `${dd}/${mm}/${yyyy}`;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/ajax_info.asp', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = () => resolve(xhr.responseText);
        xhr.onerror = () => reject(new Error('XHR failed'));
        const params = new URLSearchParams({
          param: '81', ShowTable: '1', TheDate: dateStr, Crowd: '1', tmp: String(Date.now()),
        });
        xhr.send(params.toString());
      });
    });

    const dailyRows = parseRatingsTable(dailyHtml, 20);
    if (dailyRows.length > 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isoDate = yesterday.toISOString().split('T')[0];
      const fetchedAt = new Date().toISOString();
      await db.doc(`ratings_daily/${isoDate}`).set({
        date: isoDate,
        targetAudience: 'משקי בית בכלל האוכלוסייה',
        top20: dailyRows,
        fetchedAt,
      }, { merge: true });
      console.log(`[${new Date().toISOString()}] Daily: saved ${dailyRows.length} rows for ${isoDate}`);
    } else {
      console.warn(`[${new Date().toISOString()}] Daily: no rows parsed`);
    }

    // ── Scrape weekly ratings ──
    const now = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()));
    const weekday = now.getDay(); // 0=Sun
    const shouldScrapeWeekly = forceWeekly || weekday === 0 || weekday === 1;

    if (shouldScrapeWeekly) {
      console.log(`[${new Date().toISOString()}] Fetching weekly options...`);

      // Get the list of available weeks from the dropdown
      const weekOptions = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#TheWeek option'))
          .map(el => ({ id: el.value?.trim(), label: el.textContent?.replace(/\s+/g, ' ').trim() }))
          .filter(o => o.id && o.id !== '0' && o.label);
      });

      const latestWeek = weekOptions.at(-1);
      if (!latestWeek) throw new Error('No weekly options found in dropdown');

      console.log(`[${new Date().toISOString()}] Fetching weekly: ${latestWeek.label} (id=${latestWeek.id})`);

      const weeklyHtml = await page.evaluate((weekId) => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/ajax_info.asp', true);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.onload = () => resolve(xhr.responseText);
          xhr.onerror = () => reject(new Error('XHR failed'));
          const params = new URLSearchParams({
            param: '82', ShowTable: '2', TheWeek: weekId, Crowd: '1', tmp: String(Date.now()),
          });
          xhr.send(params.toString());
        });
      }, latestWeek.id);

      const weeklyRows = parseRatingsTable(weeklyHtml, 25);
      if (weeklyRows.length === 0) throw new Error(`No weekly rows for ${latestWeek.label}`);

      await db.doc(`ratings_weekly/week-${latestWeek.id}`).set({
        weekId: latestWeek.id,
        weekRange: latestWeek.label,
        targetAudience: 'משקי בית בכלל האוכלוסייה',
        top25: weeklyRows,
        fetchedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`[${new Date().toISOString()}] Weekly: saved ${weeklyRows.length} rows for ${latestWeek.label}`);
    }

    // Update admin metrics
    await db.doc('adminMetrics/job-ratings-midrug-scrape').set({
      key: 'ratings-midrug-scrape', metricType: 'job',
      lastRunAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastStatus: 'success', lastError: null,
      lastMessage: `Puppeteer: daily ${dailyRows.length} rows${shouldScrapeWeekly ? ' + weekly' : ''}`,
      source: 'puppeteer',
    }, { merge: true });

  } finally {
    await browser.close();
  }

  process.exit(0);
}

main().catch(async err => {
  console.error(`[${new Date().toISOString()}] Fatal:`, err.message);
  await db.doc('adminMetrics/job-ratings-midrug-scrape').set({
    key: 'ratings-midrug-scrape', metricType: 'job',
    lastRunAt: new Date().toISOString(),
    lastStatus: 'failure', lastError: err.message,
    lastMessage: 'Puppeteer scrape failed',
  }, { merge: true }).catch(() => {});
  process.exit(1);
});
