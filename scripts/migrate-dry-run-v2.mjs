/**
 * Migration dry-run v2 — uses firebase-admin SDK directly.
 * Usage: node scripts/migrate-dry-run-v2.mjs [--live]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

// ── Load .env.local ──────────────────────────────────────────────────────────
const env = {};
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const PROJECT_ID = env.FIREBASE_ADMIN_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
const CLIENT_EMAIL = env.FIREBASE_ADMIN_CLIENT_EMAIL || '';
const PRIVATE_KEY = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error('Missing Firebase admin env vars in .env.local');
  process.exit(1);
}

// ── Init firebase-admin ──────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }),
    projectId: PROJECT_ID,
  });
}

const db = admin.firestore();
const dryRun = !process.argv.includes('--live');

// ── Normalizers ──────────────────────────────────────────────────────────────
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972') && digits.length >= 12) return `0${digits.slice(-9)}`;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function normalizeName(name) {
  return (name || '').trim().replace(/\s+/g, ' ');
}

// ── Convert production → global_productions doc ──────────────────────────────
function toGlobalProduction(prod, uploaderUid, sourcePath) {
  const crew_list = [];
  const phonesSet = new Set();
  const shadowKeysSet = new Set();

  for (const m of prod.crew ?? []) {
    const normPhone = normalizePhone(m.phone);
    const normName = normalizeName(m.name || '');
    const shadowKey = !normPhone && normName ? `${normName}::${m.role || ''}` : null;

    crew_list.push({
      name: m.name || '',
      profession: m.role || m.roleDetail || '',
      phone_number: normPhone ?? null,
      startTime: m.startTime || '',
      endTime: m.endTime || '',
      normalizedPhone: normPhone ?? null,
      shadowKey: shadowKey ?? null,
    });

    if (normPhone) phonesSet.add(normPhone);
    else if (shadowKey) shadowKeysSet.add(shadowKey);
  }

  return {
    id: prod.id,
    name: prod.name || '',
    studio: prod.studio || '',
    date: prod.date || '',
    day: prod.day || '',
    startTime: prod.startTime || '',
    endTime: prod.endTime || '',
    status: prod.status || 'scheduled',
    ...(prod.herzliyaId !== undefined ? { herzliyaId: prod.herzliyaId } : {}),
    crew_list,
    crew_phones: [...phonesSet],
    crew_shadow_keys: [...shadowKeysSet],
    lastUpdatedAt: prod.lastUpdatedAt || new Date().toISOString(),
    lastUpdatedBy: uploaderUid || 'migration',
    sourceWeekPath: sourcePath,
  };
}

// ── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 5) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isQuota = err.code === 8 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('Quota');
      if (isQuota && i < retries) {
        const wait = 3000 * Math.pow(2, i);
        process.stdout.write(`\n  ⏳ Quota hit, waiting ${wait/1000}s...\n`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Migration ${dryRun ? 'DRY-RUN' : 'LIVE'} — project: ${PROJECT_ID}\n`);

  // List all user UIDs that have production data
  const userRoots = await db.collection('productions').listDocuments();
  console.log(`✓ Found ${userRoots.length} user(s) with production data`);

  const allProds = [];

  for (const userRef of userRoots) {
    process.stdout.write(`  Reading user ${userRef.id.slice(0, 8)}...`);
    const weeksSnap = await withRetry(() => userRef.collection('weeks').listDocuments());
    process.stdout.write(` ${weeksSnap.length} weeks\n`);
    for (const weekRef of weeksSnap) {
      const prodsSnap = await withRetry(() => weekRef.collection('productions').get());
      for (const doc of prodsSnap.docs) {
        const data = doc.data();
        if (!data.name || !data.date) continue;
        allProds.push({
          ...data,
          id: doc.id,
          _sourcePath: `productions/${userRef.id}/weeks/${weekRef.id}`,
        });
      }
      // Small pause to stay within per-second limits
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`✓ Fetched ${allProds.length} total production docs`);

  // Dedup by id — keep most recently updated
  const byId = new Map();
  for (const doc of allProds) {
    const existing = byId.get(doc.id);
    if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
      byId.set(doc.id, doc);
    }
  }
  const unique = [...byId.values()];
  console.log(`✓ ${unique.length} unique productions after deduplication\n`);

  // Show sample
  console.log('── Sample ──────────────────────────────────────────');
  for (const p of unique.slice(0, 5)) {
    const phones = (p.crew ?? []).map(c => normalizePhone(c.phone)).filter(Boolean);
    const shadows = (p.crew ?? []).filter(c => !normalizePhone(c.phone) && c.name);
    console.log(`  • [${p.date}] ${p.name} | crew: ${(p.crew??[]).length} | phones: ${phones.length} | shadows: ${shadows.length}`);
  }
  console.log('────────────────────────────────────────────────────\n');

  if (dryRun) {
    // Also count total phones across all unique productions
    const allPhones = new Set();
    const allShadows = new Set();
    for (const p of unique) {
      for (const c of p.crew ?? []) {
        const ph = normalizePhone(c.phone);
        if (ph) allPhones.add(ph);
        else if (c.name) allShadows.add(`${normalizeName(c.name)}::${c.role||''}`);
      }
    }

    const result = {
      dryRun: true,
      users: userRoots.length,
      totalDocs: allProds.length,
      uniqueProductions: unique.length,
      uniquePhoneNumbers: allPhones.size,
      shadowProfiles: allShadows.size,
    };

    console.log('✅ DRY-RUN COMPLETE — no writes performed.\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nTo execute the live migration, run:\n  node scripts/migrate-dry-run-v2.mjs --live\n');
    return;
  }

  // Live migration — write in batches of 50
  const BATCH = 50;
  let written = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async raw => {
      if (!raw.id || !raw.date || !raw.name) { skipped++; return; }
      const doc = toGlobalProduction(raw, raw.lastUpdatedBy || 'migration', raw._sourcePath || '');
      const { id, ...docData } = doc;
      await db.collection('global_productions').doc(id).set(docData, { merge: true });
      written++;
    }));
    for (const r of results) {
      if (r.status === 'rejected') errors.push(r.reason?.message || String(r.reason));
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, unique.length)} / ${unique.length}`);
  }

  console.log('\n\n✅ LIVE MIGRATION COMPLETE\n');
  console.log(JSON.stringify({
    dryRun: false,
    uniqueProductions: unique.length,
    written,
    skipped,
    errors: errors.slice(0, 10),
  }, null, 2));
}

main()
  .catch(err => { console.error('\n❌ Migration failed:', err.message); process.exit(1); })
  .finally(() => process.exit(0));
