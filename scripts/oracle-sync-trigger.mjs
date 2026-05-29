/**
 * oracle-sync-trigger.mjs
 * Runs every 5 minutes via cron on Oracle VM.
 *
 * Two triggers:
 * 1. Manual — admin panel sets ratingsSyncRequested=true in Firestore
 * 2. Automatic — Sunday 09:00–09:30 IST (weekly ratings published by Midrug)
 *               + Daily 10:10–10:20 IST (daily ratings)
 *
 * Uses "lastAutoRunDate" in Firestore to avoid running more than once per day.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);

try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch { /* .env optional */ }

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

function israelNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '';
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const totalMinutes = hour * 60 + minute;
  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekdays[get('weekday')] ?? 0,
    totalMinutes,
  };
}

function runScraper(forceWeekly) {
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'scrape-ratings-oracle.mjs');
  execSync(`node ${scriptPath}`, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_WEEKLY: forceWeekly ? '1' : '0' },
  });
}

async function main() {
  const ref = db.doc('appConfig/global');
  const snap = await ref.get();
  const data = snap.data() || {};

  const { isoDate, weekday, totalMinutes } = israelNow();

  // ── 1. Manual trigger from admin panel ──
  if (data.ratingsSyncRequested) {
    console.log(`[${new Date().toISOString()}] Manual trigger — starting scrape (FORCE_WEEKLY=1)...`);
    await ref.update({
      ratingsSyncRequested: false,
      ratingsSyncInProgress: true,
      ratingsSyncStartedAt: new Date().toISOString(),
    });
    try {
      runScraper(true);
      await ref.update({
        ratingsSyncInProgress: false,
        ratingsSyncLastTriggeredAt: new Date().toISOString(),
        ratingsSyncLastStatus: 'success',
        lastAutoRunDate: isoDate,
      });
      console.log(`[${new Date().toISOString()}] Manual scrape done.`);
    } catch (err) {
      await ref.update({ ratingsSyncInProgress: false, ratingsSyncLastStatus: 'failure', ratingsSyncLastError: err.message }).catch(() => {});
      console.error(`[${new Date().toISOString()}] Manual scrape failed:`, err.message);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── 2. Automatic daily window: 10:10–10:20 IST (daily ratings) ──
  //       On Sunday: 09:00–09:30 IST (weekly ratings published earlier)
  const isWeeklySunday = weekday === 0 && totalMinutes >= 540 && totalMinutes < 570; // 09:00–09:30
  const isDailyWindow  = totalMinutes >= 610 && totalMinutes < 620;                  // 10:10–10:20
  const shouldAutoRun  = isWeeklySunday || isDailyWindow;

  if (!shouldAutoRun) {
    process.exit(0);
  }

  // Avoid running more than once per day
  if (data.lastAutoRunDate === isoDate) {
    process.exit(0);
  }

  const forceWeekly = isWeeklySunday;
  console.log(`[${new Date().toISOString()}] Auto run — weekday=${weekday}, window=${isWeeklySunday ? 'weekly-sunday' : 'daily'}, forceWeekly=${forceWeekly}`);

  await ref.update({
    ratingsSyncInProgress: true,
    ratingsSyncStartedAt: new Date().toISOString(),
    lastAutoRunDate: isoDate,
  });

  try {
    runScraper(forceWeekly);
    await ref.update({
      ratingsSyncInProgress: false,
      ratingsSyncLastTriggeredAt: new Date().toISOString(),
      ratingsSyncLastStatus: 'success',
    });
    console.log(`[${new Date().toISOString()}] Auto scrape done.`);
  } catch (err) {
    await ref.update({ ratingsSyncInProgress: false, ratingsSyncLastStatus: 'failure', ratingsSyncLastError: err.message }).catch(() => {});
    console.error(`[${new Date().toISOString()}] Auto scrape failed:`, err.message);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('oracle-sync-trigger fatal:', err.message);
  process.exit(1);
});
