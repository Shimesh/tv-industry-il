'use strict';
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs'), path = require('path');

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    let value = line.slice(idx + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    }
    if (!process.env[line.slice(0, idx)]) process.env[line.slice(0, idx)] = value;
  }
}

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID  || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

async function main() {
  const db = getFirestore();

  // Query this week's global_productions
  const weekStart = '2026-06-14';
  const weekEnd   = '2026-06-20';

  console.log(`\n=== global_productions ${weekStart}..${weekEnd} ===`);
  const snap = await db.collection('global_productions')
    .where('date', '>=', weekStart)
    .where('date', '<=', weekEnd)
    .get();

  console.log(`Total docs: ${snap.size}\n`);

  // Group by herzliyaId+date
  const byKey = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const key = d.herzliyaId ? `herzliya:${d.herzliyaId}::${d.date}` : `name:${d.name}::${d.date}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ docId: doc.id, name: d.name, studio: d.studio, herzliyaId: d.herzliyaId, crew: d.crew_list?.length ?? 0, time: `${d.startTime}-${d.endTime}` });
  }

  let duplicates = 0;
  for (const [key, entries] of [...byKey.entries()].sort()) {
    if (entries.length > 1) {
      duplicates++;
      console.log(`DUPLICATE (${entries.length}x): ${key}`);
      for (const e of entries) {
        console.log(`  docId="${e.docId}" name="${e.name}" studio="${e.studio}" time="${e.time}" crew=${e.crew}`);
      }
    }
  }

  if (duplicates === 0) {
    console.log('✓ No duplicates in global_productions for this week!');
    console.log('\nAll docs:');
    for (const [key, entries] of [...byKey.entries()].sort()) {
      const e = entries[0];
      console.log(`  docId="${e.docId}" name="${e.name}" studio="${e.studio}" time="${e.time}" crew=${e.crew}`);
    }
  }

  // Also check personal subcollections for this user
  console.log('\n=== personal productions (collectionGroup) ===');
  const personalSnap = await db.collectionGroup('productions')
    .where('date', '>=', weekStart)
    .where('date', '<=', weekEnd)
    .get();

  const personalDocs = personalSnap.docs.filter(doc => {
    const p = doc.ref.path.split('/');
    return p.length === 6 && p[0] === 'productions' && p[2] === 'weeks' && p[4] === 'productions';
  });

  console.log(`Personal docs for this week: ${personalDocs.length}`);
  for (const doc of personalDocs) {
    const d = doc.data();
    console.log(`  path=${doc.ref.path}`);
    console.log(`    docId="${doc.id}" name="${d.name}" herzliyaId=${d.herzliyaId} studio="${d.studio}"`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
