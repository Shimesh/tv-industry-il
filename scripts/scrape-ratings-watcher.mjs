/**
 * scrape-ratings-watcher.mjs
 * Runs as a daemon on Windows (Task Scheduler: at login).
 * - Listens to Firestore triggers/ratings-scrape for manual triggers from admin panel
 * - Runs daily scrape at 10:15 IST, retries every 30 min until data arrives
 * - Reports live status (running/success/failure) to adminMetrics/job-ratings-scrape
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const SCRAPER = resolve(dirname(fileURLToPath(import.meta.url)), 'scrape-ratings-oracle.mjs');
let scraping = false;

async function runScraper(trigger = 'auto') {
  if (scraping) { console.log(`[${ts()}] Already running, skipping (${trigger})`); return; }
  scraping = true;
  console.log(`[${ts()}] Starting scrape (${trigger})...`);

  await db.doc('adminMetrics/job-ratings-scrape').set({
    key: 'ratings-scrape', metricType: 'job', label: 'ratings-scrape',
    lastRunAt: new Date().toISOString(), lastStatus: 'running',
    lastError: null, source: 'local-watcher',
  }, { merge: true });

  return new Promise((res) => {
    const proc = spawn(process.execPath, [SCRAPER], { env: process.env, stdio: 'inherit' });
    proc.on('close', (code) => {
      scraping = false;
      console.log(`[${ts()}] Scrape ${code === 0 ? 'succeeded' : `failed (exit ${code})`}`);
      res();
    });
  });
}

// Manual trigger listener
db.doc('triggers/ratings-scrape').onSnapshot(async (snap) => {
  if (!snap.exists) return;
  const data = snap.data();
  if (data?.status !== 'pending') return;
  await snap.ref.update({ status: 'running', pickedUpAt: new Date().toISOString() });
  await runScraper('manual');
  await snap.ref.update({ status: 'done', completedAt: new Date().toISOString() });
});

// Daily schedule helpers
function ts() { return new Date().toISOString(); }

function msUntilNext(hour, minute) {
  const parts = Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  let diff = (hour * 60 + minute) - (h * 60 + m);
  if (diff <= 0) diff += 24 * 60;
  return diff * 60 * 1000;
}

function todayIlISO() {
  const parts = Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function hasDataForToday() {
  const doc = await db.doc(`ratings_daily/${todayIlISO()}`).get();
  return doc.exists;
}

let retryTimer = null;

function clearRetry() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

function scheduleNextDay() {
  clearRetry();
  const delay = msUntilNext(10, 15);
  console.log(`[${ts()}] Next daily run in ${Math.round(delay / 60000)} min`);
  setTimeout(startDailyRun, delay);
}

async function startDailyRun() {
  if (await hasDataForToday()) {
    console.log(`[${ts()}] Already have today's data, skipping`);
    scheduleNextDay();
    return;
  }
  await runScraper('daily');
  if (await hasDataForToday()) {
    scheduleNextDay();
  } else {
    console.log(`[${ts()}] No data yet, retrying every 30 min...`);
    retryTimer = setInterval(async () => {
      if (await hasDataForToday()) { clearRetry(); scheduleNextDay(); return; }
      await runScraper('retry');
    }, 30 * 60 * 1000);
  }
}

const delay = msUntilNext(10, 15);
console.log(`[${ts()}] Watcher started. Next daily run in ${Math.round(delay / 60000)} min. Listening for triggers...`);
setTimeout(startDailyRun, delay);

// Start Telegram listener (non-fatal if Telegram creds not configured)
import('./scrape-ratings-telegram.mjs').then(mod =>
  mod.startTelegramListener(db)
).catch(err => console.log(`[${ts()}] Telegram listener failed to start: ${err.message}`));
