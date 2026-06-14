'use strict';
/**
 * Cleanup script: remove duplicate global_productions entries and eliminate
 * personal productions that already exist in global_productions (the root
 * cause of duplicates in the WeeklyCalendarWidget without requiring a Vercel
 * redeploy).
 *
 * Phases:
 *  1. global_productions — dedup by herzliyaId+date, strip role suffixes from names.
 *  2. personal subcollections — for each entry that has a matching global entry
 *     (same herzliyaId+date), delete it; global is the single source of truth.
 *     For entries without a global counterpart, dedup + strip role suffix.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-productions.js [--dry-run]
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load env vars
// ---------------------------------------------------------------------------
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
  console.error('Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

// ---------------------------------------------------------------------------
// Role suffixes (mirrors productionScheduleParser.ts + calendar-sync.cjs)
// ---------------------------------------------------------------------------
const HERZLIYA_ROLE_SUFFIXES = [
  'ניהול הפקה', 'עריכת שיא', 'ע. בימוי', 'ע. מפיק', 'ע. מפיקה', 'ע. צילום',
  'ע. עריכה', 'ע. תאורה', 'ע. סאונד', 'סטדי קאם', 'סטדי-קאם', 'סטדיקאם',
  'צלם רחף', 'רחף', 'רחפן', 'רחפנית',
  'צילום', 'עריכה', 'סאונד', 'תאורה', 'בימוי', 'עיצוב', 'ניהול',
  'שידור', 'מפיקה', 'מפיק', 'ספרות', 'תסריט', 'גרפיקה', 'תפאורה',
  'איפור', 'לוגיסטיקה', 'הנחיה', 'הפקה', 'עורך', 'עורכת',
  'מנהל', 'מנהלת', 'הדלקות', 'לייטינג', 'חשמל', 'קאמרה', 'קול', 'CCU',
];

function stripRole(name) {
  const t = (name || '').trim();
  for (const role of HERZLIYA_ROLE_SUFFIXES) {
    if (t === role) return t;
    if (t.endsWith(' ' + role)) {
      const stripped = t.slice(0, t.length - role.length - 1).trim();
      if (stripped) return stripped;
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = getFirestore();
  console.log(`[cleanup] DRY_RUN=${DRY_RUN}\n`);

  // ==========================================================================
  // PHASE 1 — global_productions
  // ==========================================================================
  console.log('=== PHASE 1: global_productions ===');
  const globalSnap = await db.collection('global_productions').get();
  console.log(`Fetched ${globalSnap.size} global documents.`);

  const byHerzliya = new Map();   // key: herzliyaId::date → winning doc (after dedup)
  const globalNoId = [];

  for (const doc of globalSnap.docs) {
    const data = doc.data();
    if (data.herzliyaId && data.date) {
      const key = `${data.herzliyaId}::${data.date}`;
      if (!byHerzliya.has(key)) {
        byHerzliya.set(key, []);
      }
      byHerzliya.get(key).push({ id: doc.id, ref: doc.ref, data });
    } else {
      globalNoId.push({ id: doc.id, ref: doc.ref, data });
    }
  }

  let g_deleted = 0, g_updated = 0;

  for (const [key, group] of byHerzliya.entries()) {
    group.sort((a, b) => {
      const diff = (b.data.crew_list?.length ?? 0) - (a.data.crew_list?.length ?? 0);
      if (diff !== 0) return diff;
      return String(b.data.lastUpdatedAt ?? '') > String(a.data.lastUpdatedAt ?? '') ? 1 : -1;
    });

    const winner = group[0];
    const losers = group.slice(1);

    if (losers.length > 0) {
      console.log(`  [GLOBAL DEDUP] ${key} → keep ${winner.id}, delete [${losers.map(l => l.id).join(', ')}]`);
      if (!DRY_RUN) await Promise.all(losers.map(l => l.ref.delete()));
      g_deleted += losers.length;
      // Replace group entry with winner only
      byHerzliya.set(key, [winner]);
    }

    const cleanName = stripRole(winner.data.name);
    if (cleanName !== winner.data.name) {
      console.log(`  [GLOBAL RENAME] ${winner.id}: "${winner.data.name}" → "${cleanName}"`);
      if (!DRY_RUN) await winner.ref.update({ name: cleanName });
      winner.data = { ...winner.data, name: cleanName };  // update local cache
      g_updated++;
    }
  }

  for (const { id, ref, data } of globalNoId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name) {
      console.log(`  [GLOBAL RENAME] ${id}: "${data.name}" → "${cleanName}"`);
      if (!DRY_RUN) await ref.update({ name: cleanName });
      g_updated++;
    }
  }

  console.log(`\nPhase 1 done: deleted=${g_deleted}, updated_names=${g_updated}\n`);

  // Build a set of herzliyaId::date keys that exist in global (for Phase 2 lookup)
  const globalHerzliyaKeys = new Set(byHerzliya.keys());

  // ==========================================================================
  // PHASE 2 — personal subcollections
  // productions/{uid}/weeks/{weekId}/productions/{prodId}
  //
  // Strategy:
  //   • If a matching global entry exists (same herzliyaId+date): DELETE the
  //     personal entry entirely. Global is the single source of truth, so the
  //     widget will see each production exactly once.
  //   • If no global counterpart: strip role from name, deduplicate.
  // ==========================================================================
  console.log('=== PHASE 2: personal subcollections ===');
  const personalSnap = await db.collectionGroup('productions').get();

  const personalDocs = personalSnap.docs.filter((doc) => {
    const parts = doc.ref.path.split('/');
    // productions/{uid}/weeks/{weekId}/productions/{prodId} → length 6
    return parts.length === 6 && parts[0] === 'productions' && parts[2] === 'weeks' && parts[4] === 'productions';
  });
  console.log(`Found ${personalDocs.length} personal production documents.`);

  let p_deleted = 0, p_updated = 0, p_skipped = 0;

  // Group by herzliyaId::date::uid for per-user dedup
  const personalByKey = new Map();
  const personalNoId = [];

  for (const doc of personalDocs) {
    const data = doc.data();
    const parts = doc.ref.path.split('/');
    const uid = parts[1];
    const herzliyaId = data.herzliyaId;
    const date = data.date;

    if (herzliyaId && date) {
      const key = `${herzliyaId}::${date}::${uid}`;
      if (!personalByKey.has(key)) personalByKey.set(key, []);
      personalByKey.get(key).push({ id: doc.id, ref: doc.ref, data, uid });
    } else {
      personalNoId.push({ id: doc.id, ref: doc.ref, data, uid: parts[1] });
    }
  }

  for (const [key, group] of personalByKey.entries()) {
    const [herzliyaId, date] = key.split('::');
    const globalKey = `${herzliyaId}::${date}`;

    if (globalHerzliyaKeys.has(globalKey)) {
      // Global counterpart exists — delete ALL personal entries for this production.
      // The widget will show it from global_productions only, no duplicate.
      console.log(`  [PERSONAL DELETE] herzliyaId=${herzliyaId} date=${date} uid=${group[0].uid} (${group.length} doc(s)) — global exists`);
      if (!DRY_RUN) await Promise.all(group.map(entry => entry.ref.delete()));
      p_deleted += group.length;
    } else {
      // No global entry — keep personal, just clean it up
      group.sort((a, b) => {
        const diff = (b.data.crew?.length ?? 0) - (a.data.crew?.length ?? 0);
        if (diff !== 0) return diff;
        return String(b.data.lastUpdatedAt ?? '') > String(a.data.lastUpdatedAt ?? '') ? 1 : -1;
      });
      const winner = group[0];
      const losers = group.slice(1);
      if (losers.length > 0) {
        if (!DRY_RUN) await Promise.all(losers.map(l => l.ref.delete()));
        p_deleted += losers.length;
      }
      const cleanName = stripRole(winner.data.name);
      if (cleanName !== winner.data.name) {
        if (!DRY_RUN) await winner.ref.update({ name: cleanName });
        p_updated++;
      }
      p_skipped++;
    }
  }

  // Strip roles from no-herzliyaId personal entries
  for (const { id, ref, data } of personalNoId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name) {
      if (!DRY_RUN) await ref.update({ name: cleanName });
      p_updated++;
    }
  }

  console.log(`\nPhase 2 done: deleted=${p_deleted}, updated_names=${p_updated}, no_global_counterpart=${p_skipped}`);

  console.log('\n=== SUMMARY ===');
  console.log(`global_productions: ${g_deleted} duplicates deleted, ${g_updated} names stripped`);
  console.log(`personal docs: ${p_deleted} deleted (had global counterpart), ${p_updated} names stripped, ${p_skipped} kept (no global)`);
  if (DRY_RUN) console.log('\n(DRY RUN — no changes written to Firestore)');
  else console.log('\nFirestore cleanup complete. Refresh the app to see the result.');
}

main().catch((err) => {
  console.error('[cleanup] Fatal error:', err);
  process.exit(1);
});
