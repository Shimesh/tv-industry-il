/**
 * oracle-sync-trigger.mjs
 * Runs every 5 minutes via cron on Oracle VM.
 * Checks Firestore for a sync request written by the admin panel,
 * and if found, runs the full ratings scrape (daily + weekly).
 *
 * Cron setup (run once on Oracle VM):
 *   crontab -e
 *   Add: *\/5 * * * * cd ~/ratings-scraper && node oracle-sync-trigger.mjs >> ~/sync-trigger.log 2>&1
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

async function main() {
  const ref = db.doc('appConfig/global');
  const snap = await ref.get();
  const data = snap.data() || {};

  if (!data.ratingsSyncRequested) {
    process.exit(0);
  }

  const requestedAt = data.ratingsSyncRequestedAt || 'unknown';
  console.log(`[${new Date().toISOString()}] Sync requested at ${requestedAt} — starting scrape...`);

  // Mark as in-progress and clear the flag
  await ref.update({
    ratingsSyncRequested: false,
    ratingsSyncInProgress: true,
    ratingsSyncStartedAt: new Date().toISOString(),
  });

  try {
    const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'scrape-ratings-oracle.mjs');
    // Pass FORCE_WEEKLY=1 so the oracle script always scrapes weekly when manually triggered
    execSync(`FORCE_WEEKLY=1 node ${scriptPath}`, {
      stdio: 'inherit',
      env: { ...process.env, FORCE_WEEKLY: '1' },
    });

    await ref.update({
      ratingsSyncInProgress: false,
      ratingsSyncLastTriggeredAt: new Date().toISOString(),
      ratingsSyncLastStatus: 'success',
    });

    console.log(`[${new Date().toISOString()}] Triggered scrape completed successfully.`);
  } catch (err) {
    await ref.update({
      ratingsSyncInProgress: false,
      ratingsSyncLastStatus: 'failure',
      ratingsSyncLastError: err.message,
    }).catch(() => {});
    console.error(`[${new Date().toISOString()}] Triggered scrape failed:`, err.message);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('oracle-sync-trigger fatal:', err.message);
  process.exit(1);
});
