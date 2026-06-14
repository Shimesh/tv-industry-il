'use strict';
/**
 * Cleanup: normalize global_productions to use herzliyaId-based document IDs.
 *
 * Root cause of duplicates:
 *   - calendar-sync.cjs writes global_productions with doc ID = String(herzliyaId)
 *   - The frontend paste flow uses ID = hash(name+date+studio)
 *   Both refer to the same production → two docs with different IDs → widget shows both.
 *
 * Fix:
 *   Phase 1 — global_productions:
 *     For each herzliyaId+date group, consolidate all entries into a single doc
 *     whose ID = String(herzliyaId).  After this, every subsequent sync-calendar
 *     run writes to the same doc and cannot create a new duplicate.
 *   Phase 2 — personal subcollections:
 *     Delete personal entries that have a global counterpart (global is the
 *     single source of truth).  The next sync recreates them with matching IDs.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-productions.js [--dry-run]
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// ── env loading ──────────────────────────────────────────────────────────────
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

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials.');
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

// ── role suffixes ────────────────────────────────────────────────────────────
const HERZLIYA_ROLE_SUFFIXES = [
  'ניהול הפקה','ניהול במה','עריכת שיא','ע. בימוי','ע. מפיק','ע. מפיקה','ע. צילום',
  'ע. עריכה','ע. תאורה','ע. סאונד','סטדי קאם','סטדי-קאם','סטדיקאם',
  'צלם רחף','רחף','רחפן','רחפנית',
  'צילום','עריכה','סאונד','תאורה','בימוי','עיצוב','ניהול',
  'שידור','מפיקה','מפיק','ספרות','תסריט','גרפיקה','תפאורה',
  'איפור','לוגיסטיקה','הנחיה','הפקה','עורך','עורכת',
  'מנהל','מנהלת','הדלקות','לייטינג','חשמל','קאמרה','קול','CCU',
];
function stripRole(name) {
  const t = (name || '').trim();
  for (const role of HERZLIYA_ROLE_SUFFIXES) {
    if (t === role) return t;
    if (t.endsWith(' ' + role)) {
      const s = t.slice(0, t.length - role.length - 1).trim();
      if (s) return s;
    }
  }
  return t;
}

// ── main ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = getFirestore();
  console.log(`[cleanup] DRY_RUN=${DRY_RUN}\n`);

  // ==========================================================================
  // PHASE 1 — normalize global_productions to herzliyaId-based document IDs
  // ==========================================================================
  console.log('=== PHASE 1: global_productions ===');
  const globalSnap = await db.collection('global_productions').get();
  console.log(`Fetched ${globalSnap.size} documents.`);

  // Group by herzliyaId::date
  const byHerzliya = new Map();
  const globalNoId  = [];

  for (const doc of globalSnap.docs) {
    const data = doc.data();
    if (data.herzliyaId && data.date) {
      const key = `${data.herzliyaId}::${data.date}`;
      if (!byHerzliya.has(key)) byHerzliya.set(key, []);
      byHerzliya.get(key).push({ id: doc.id, ref: doc.ref, data });
    } else {
      globalNoId.push({ id: doc.id, ref: doc.ref, data });
    }
  }

  // Track canonical IDs so Phase 2 can check them
  const canonicalIds = new Set();   // doc IDs after normalization
  let g_written = 0, g_deleted = 0, g_skipped = 0;

  for (const [key, group] of byHerzliya.entries()) {
    const herzliyaId  = String(group[0].data.herzliyaId);
    const canonicalId = herzliyaId;               // what calendar-sync.cjs uses
    canonicalIds.add(canonicalId);

    // Sort: most crew → most recent
    group.sort((a, b) => {
      const diff = (b.data.crew_list?.length ?? 0) - (a.data.crew_list?.length ?? 0);
      if (diff !== 0) return diff;
      return String(b.data.lastUpdatedAt ?? '') > String(a.data.lastUpdatedAt ?? '') ? 1 : -1;
    });

    const winner    = group[0];
    const others    = group.filter(g => g.id !== canonicalId);
    const isAlready = winner.id === canonicalId && group.length === 1;
    const cleanName = stripRole(winner.data.name);

    if (isAlready && cleanName === winner.data.name) {
      g_skipped++;
      continue;  // already canonical, nothing to do
    }

    const canonicalData = { ...winner.data, id: canonicalId, name: cleanName };
    const toDelete      = group.filter(g => g.id !== canonicalId);  // everything that isn't the canonical doc

    console.log(`  [NORMALIZE] herzliyaId=${herzliyaId} → canonical=${canonicalId}`);
    if (group.length > 1) {
      console.log(`    merge ${group.length} docs: keep winner ${winner.id}, delete [${group.slice(1).map(g=>g.id).join(', ')}]`);
    }
    if (cleanName !== winner.data.name) {
      console.log(`    name: "${winner.data.name}" → "${cleanName}"`);
    }

    if (!DRY_RUN) {
      const canonicalRef = db.collection('global_productions').doc(canonicalId);
      await canonicalRef.set(canonicalData);                           // upsert canonical
      await Promise.all(toDelete.map(g => g.ref.delete()));           // delete all non-canonical
      // If winner itself isn't canonical, delete it too (data already copied above)
      if (winner.id !== canonicalId) await winner.ref.delete();
    }
    g_written++;
    g_deleted += toDelete.length + (winner.id !== canonicalId ? 1 : 0);
  }

  // Strip roles from entries without herzliyaId
  for (const { id, ref, data } of globalNoId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name) {
      console.log(`  [UPDATE no-id] ${id}: "${data.name}" → "${cleanName}"`);
      if (!DRY_RUN) await ref.update({ name: cleanName });
      g_written++;
    }
    // These have no herzliyaId — can't normalize further
  }

  console.log(`\nPhase 1 done: normalized=${g_written}, deleted=${g_deleted}, already_ok=${g_skipped}\n`);

  // Rebuild canonical set from actual Firestore IDs after writes
  const globalHerzliyaKeys = new Set(
    Array.from(byHerzliya.entries()).map(([key]) => key),
  );

  // ==========================================================================
  // PHASE 2 — personal subcollections
  // Delete entries that have a global counterpart (by herzliyaId+date).
  // The next sync will recreate them with the canonical ID, so they'll dedup.
  // ==========================================================================
  console.log('=== PHASE 2: personal subcollections ===');
  const personalSnap = await db.collectionGroup('productions').get();
  const personalDocs = personalSnap.docs.filter(doc => {
    const p = doc.ref.path.split('/');
    return p.length === 6 && p[0] === 'productions' && p[2] === 'weeks' && p[4] === 'productions';
  });
  console.log(`Found ${personalDocs.length} personal production documents.`);

  // Group by herzliyaId::date::uid
  const personalByKey = new Map();
  const personalNoId  = [];

  for (const doc of personalDocs) {
    const data  = doc.data();
    const parts = doc.ref.path.split('/');
    const uid   = parts[1];
    if (data.herzliyaId && data.date) {
      const key = `${data.herzliyaId}::${data.date}::${uid}`;
      if (!personalByKey.has(key)) personalByKey.set(key, []);
      personalByKey.get(key).push({ id: doc.id, ref: doc.ref, data, uid });
    } else {
      personalNoId.push({ id: doc.id, ref: doc.ref, data });
    }
  }

  let p_deleted = 0, p_kept = 0;

  for (const [key, group] of personalByKey.entries()) {
    const [herzliyaId, date] = key.split('::');
    const globalKey = `${herzliyaId}::${date}`;

    if (globalHerzliyaKeys.has(globalKey)) {
      // Global counterpart exists → delete all personal entries for this production
      console.log(`  [PERSONAL DELETE] herzliyaId=${herzliyaId} date=${date} uid=${group[0].uid} (${group.length} doc(s))`);
      if (!DRY_RUN) await Promise.all(group.map(e => e.ref.delete()));
      p_deleted += group.length;
    } else {
      // No global — strip role from name, keep as-is
      for (const { ref, data } of group) {
        const cleanName = stripRole(data.name);
        if (cleanName !== data.name) {
          if (!DRY_RUN) await ref.update({ name: cleanName });
        }
      }
      p_kept += group.length;
    }
  }

  for (const { ref, data } of personalNoId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name && !DRY_RUN) await ref.update({ name: cleanName });
  }

  console.log(`\nPhase 2 done: deleted=${p_deleted}, kept_no_global=${p_kept}`);
  console.log('\n=== SUMMARY ===');
  console.log(`global_productions: ${g_written} normalized/updated, ${g_deleted} old docs deleted`);
  console.log(`personal: ${p_deleted} deleted (global exists), ${p_kept} kept`);
  if (DRY_RUN) console.log('\n(DRY RUN — no changes written)');
  else          console.log('\nDone. Refresh the app to see clean data.');
}

main().catch(err => { console.error(err); process.exit(1); });
