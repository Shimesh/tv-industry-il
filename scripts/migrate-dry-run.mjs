/**
 * Migration dry-run script — runs directly with Node.js using service account credentials.
 * Usage: node scripts/migrate-dry-run.mjs [--live]
 *
 * --live   Execute the migration (writes to global_productions)
 * default  Dry-run only (no writes)
 */

import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  console.error('Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY in .env.local');
  process.exit(1);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const dryRun = !process.argv.includes('--live');

// ── Get Google access token ──────────────────────────────────────────────────
function base64Url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign(PRIVATE_KEY);
  const assertion = `${unsigned}.${base64Url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ── Firestore helpers ────────────────────────────────────────────────────────
function fromVal(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(fromVal);
  if ('mapValue' in v) {
    const f = v.mapValue?.fields ?? {};
    return Object.fromEntries(Object.entries(f).map(([k, fv]) => [k, fromVal(fv)]));
  }
  return null;
}

function fromDoc(doc) {
  const f = doc.fields ?? {};
  const out = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fromVal(v)]));
  out.id = doc.name.split('/').pop() ?? '';
  out._path = doc.name.split('/documents/')[1] ?? '';
  return out;
}

function toVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toVal(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toVal(v);
  return fields;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runQuery(token, query, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: query }),
    });
    if (res.status === 429 && attempt < retries) {
      const wait = 2000 * Math.pow(2, attempt);
      console.log(`  ⏳ Rate limited, retrying in ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Query error: ${await res.text()}`);
    const payload = await res.json();
    return payload.filter(e => e.document).map(e => fromDoc(e.document));
  }
  throw new Error('Query failed after retries');
}

async function patchDoc(token, path, data) {
  const params = new URLSearchParams();
  for (const k of Object.keys(data)) params.append('updateMask.fieldPaths', k);
  const res = await fetch(`${BASE}/${path}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`Patch error ${path}: ${await res.text()}`);
}

// ── Normalizers (mirrors src/lib/crewNormalization.ts) ───────────────────────
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
    const shadowKey = normPhone === null && normName
      ? `${normName}::${m.role || ''}`
      : null;

    crew_list.push({
      name: m.name || '',
      profession: m.role || m.roleDetail || '',
      phone_number: normPhone,
      startTime: m.startTime || '',
      endTime: m.endTime || '',
      normalizedPhone: normPhone,
      shadowKey,
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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Migration ${dryRun ? 'DRY-RUN' : 'LIVE'} — project: ${PROJECT_ID}\n`);

  const token = await getAccessToken();
  console.log('✓ Service account authenticated');

  // First: list all top-level users who have production data
  console.log('Fetching user production roots...');
  const userRootsRes = await fetch(`${BASE}/productions?pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userRootsRes.ok) {
    const text = await userRootsRes.text();
    throw new Error(`Failed to list production roots: ${text}`);
  }
  const userRootsData = await userRootsRes.json();
  const userRoots = (userRootsData.documents ?? []).map(d => d.name.split('/').pop());
  console.log(`✓ Found ${userRoots.length} user(s) with production data`);

  // For each user, list their weeks, then list productions in each week
  const allDocs = [];
  for (const uid of userRoots) {
    let weekToken = '';
    do {
      const weeksUrl = `${BASE}/productions/${uid}/weeks?pageSize=100${weekToken ? `&pageToken=${weekToken}` : ''}`;
      const weeksRes = await fetch(weeksUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!weeksRes.ok) break;
      const weeksData = await weeksRes.json();
      weekToken = weeksData.nextPageToken || '';
      for (const weekDoc of weeksData.documents ?? []) {
        const weekId = weekDoc.name.split('/').pop();
        // List productions in this week
        let prodToken = '';
        do {
          const prodsUrl = `${BASE}/productions/${uid}/weeks/${weekId}/productions?pageSize=100${prodToken ? `&pageToken=${prodToken}` : ''}`;
          const prodsRes = await fetch(prodsUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!prodsRes.ok) break;
          const prodsData = await prodsRes.json();
          prodToken = prodsData.nextPageToken || '';
          for (const doc of prodsData.documents ?? []) {
            allDocs.push(fromDoc(doc));
          }
        } while (prodToken);
      }
    } while (weekToken);
  }
  console.log(`✓ Fetched ${allDocs.length} total documents from productions/**`);

  // Filter to real production docs
  const filtered = allDocs.filter(doc =>
    doc._path?.includes('/weeks/') && doc.name && doc.date && Array.isArray(doc.crew)
  );
  console.log(`✓ ${filtered.length} are valid production docs (with name + date + crew)`);

  // Dedup by id — keep most recently updated
  const byId = new Map();
  for (const doc of filtered) {
    if (!doc.id) continue;
    const existing = byId.get(doc.id);
    if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
      byId.set(doc.id, doc);
    }
  }
  const unique = [...byId.values()];
  console.log(`✓ ${unique.length} unique productions after deduplication\n`);

  // Sample preview
  const sample = unique.slice(0, 3);
  console.log('── Sample productions ──────────────────────────────');
  for (const p of sample) {
    const phones = (p.crew ?? []).map(c => normalizePhone(c.phone)).filter(Boolean);
    console.log(`  • ${p.name} | ${p.date} | crew: ${(p.crew ?? []).length} | phones: ${phones.length}`);
  }
  console.log('────────────────────────────────────────────────────\n');

  if (dryRun) {
    console.log('✅ DRY-RUN COMPLETE — no writes performed.\n');
    console.log('Results:');
    console.log(JSON.stringify({
      dryRun: true,
      total: allDocs.length,
      filtered: filtered.length,
      unique: unique.length,
    }, null, 2));
    console.log('\nTo execute the live migration, run:\n  node scripts/migrate-dry-run.mjs --live\n');
    return;
  }

  // Live: write in batches of 50
  const BATCH = 50;
  let written = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async raw => {
      if (!raw.id || !raw.date || !raw.name) { skipped++; return; }
      const sourcePath = (() => {
        const parts = (raw._path || '').split('/');
        const wi = parts.indexOf('weeks');
        return wi >= 0 ? parts.slice(0, wi + 2).join('/') : raw._path;
      })();
      const doc = toGlobalProduction(raw, raw.lastUpdatedBy || 'migration', sourcePath);
      await patchDoc(token, `global_productions/${doc.id}`, doc);
      written++;
    }));
    for (const r of results) {
      if (r.status === 'rejected') errors.push(r.reason?.message || String(r.reason));
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, unique.length)} / ${unique.length}`);
  }

  console.log('\n\n✅ LIVE MIGRATION COMPLETE\n');
  console.log(JSON.stringify({ dryRun: false, total: allDocs.length, filtered: filtered.length, unique: unique.length, written, skipped, errors: errors.slice(0, 10) }, null, 2));
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
