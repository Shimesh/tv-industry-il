'use strict';
/**
 * Cleanup script: remove duplicate global_productions entries caused by the
 * role-suffix stripping change (e.g. "אסתטיקה 360 צילום" vs "אסתטיקה 360"
 * are stored with different IDs but represent the same Herzliya production).
 *
 * Strategy:
 *  1. Fetch all global_productions documents.
 *  2. Group by herzliyaId+date (primary key) or by stripped_name+date+startTime (fallback).
 *  3. Within each group keep the "winner" (most crew members, then newest lastUpdatedAt).
 *  4. Delete all other documents in the group.
 *  5. Update the winner's name if it still contains a role suffix.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-productions.js [--dry-run]
 *
 * Set --dry-run to preview changes without writing to Firestore.
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load env (from .env.local if running locally, or from process.env for CI)
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

// Support both FIREBASE_ADMIN_* (local) and FIREBASE_* (GitHub Actions) prefixes
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '')
  .replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

// ---------------------------------------------------------------------------
// Role suffixes (mirrors productionScheduleParser.ts)
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
    if (t === role) return t; // entire name is a role — keep as-is
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
  console.log(`[cleanup-duplicates] DRY_RUN=${DRY_RUN}`);
  console.log('[cleanup-duplicates] Fetching all global_productions …');

  const snap = await db.collection('global_productions').get();
  console.log(`[cleanup-duplicates] Fetched ${snap.size} documents.`);

  // Group docs
  const byHerzliya = new Map();   // key: `{herzliyaId}::{date}`
  const noId = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const herzliyaId = data.herzliyaId;
    const date = data.date;
    if (herzliyaId && date) {
      const key = `${herzliyaId}::${date}`;
      if (!byHerzliya.has(key)) byHerzliya.set(key, []);
      byHerzliya.get(key).push({ id: doc.id, ref: doc.ref, data });
    } else {
      noId.push({ id: doc.id, ref: doc.ref, data });
    }
  }

  let deletedCount = 0;
  let updatedCount = 0;

  for (const [key, group] of byHerzliya.entries()) {
    if (group.length === 1) {
      // No duplicate — but still check if name needs stripping
      const { id, ref, data } = group[0];
      const cleanName = stripRole(data.name);
      if (cleanName !== data.name) {
        console.log(`  [UPDATE] ${id} name: "${data.name}" → "${cleanName}"`);
        if (!DRY_RUN) await ref.update({ name: cleanName });
        updatedCount++;
      }
      continue;
    }

    // Sort: most crew first, then newest lastUpdatedAt
    group.sort((a, b) => {
      const crewDiff = (b.data.crew_list?.length ?? 0) - (a.data.crew_list?.length ?? 0);
      if (crewDiff !== 0) return crewDiff;
      return String(b.data.lastUpdatedAt ?? '') > String(a.data.lastUpdatedAt ?? '') ? 1 : -1;
    });

    const winner = group[0];
    const losers = group.slice(1);
    const cleanName = stripRole(winner.data.name);

    const loserIds = losers.map((l) => l.id).join(', ');
    console.log(`  [DEDUP] herzliyaId=${key.split('::')[0]} date=${key.split('::')[1]}`);
    console.log(`    KEEP: ${winner.id} (name="${winner.data.name}", crew=${winner.data.crew_list?.length ?? 0})`);
    console.log(`    DELETE: ${loserIds}`);

    if (!DRY_RUN) {
      await Promise.all(losers.map((l) => l.ref.delete()));
      if (cleanName !== winner.data.name) {
        await winner.ref.update({ name: cleanName });
        updatedCount++;
      }
    }
    deletedCount += losers.length;
  }

  // Strip roles from no-herzliyaId entries too
  for (const { id, ref, data } of noId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name) {
      console.log(`  [UPDATE] ${id} name: "${data.name}" → "${cleanName}"`);
      if (!DRY_RUN) await ref.update({ name: cleanName });
      updatedCount++;
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Fix personal productions subcollections
  // Path: productions/{uid}/weeks/{weekId}/productions/{prodId}
  // These have the old role-suffixed names AND old IDs based on the old name.
  // Fix: for entries with role in name, delete old doc + create new doc with
  // stripped name and new ID so they match the global_productions IDs.
  // -------------------------------------------------------------------------
  console.log('\n[cleanup-duplicates] Phase 2: scanning personal productions subcollections …');

  const personalSnap = await db.collectionGroup('productions').get();
  // Filter to only personal subcollection docs (not global)
  const personalDocs = personalSnap.docs.filter((doc) => {
    const parts = doc.ref.path.split('/');
    // productions/{uid}/weeks/{weekId}/productions/{prodId}  →  length 6
    return parts.length === 6 && parts[0] === 'productions' && parts[2] === 'weeks' && parts[4] === 'productions';
  });
  console.log(`[cleanup-duplicates] Found ${personalDocs.length} personal production documents.`);

  // Group by uid+weekId so we can dedup within each week
  const personalByKey = new Map(); // key: `{herzliyaId}::{date}::{uid}`
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
      personalNoId.push({ id: doc.id, ref: doc.ref, data, uid });
    }
  }

  let personalDeleted = 0;
  let personalRenamed = 0;

  for (const [, group] of personalByKey.entries()) {
    // Sort: most crew, then newest
    group.sort((a, b) => {
      const crewDiff = (b.data.crew?.length ?? 0) - (a.data.crew?.length ?? 0);
      if (crewDiff !== 0) return crewDiff;
      return String(b.data.lastUpdatedAt ?? '') > String(a.data.lastUpdatedAt ?? '') ? 1 : -1;
    });

    const winner = group[0];
    const losers = group.slice(1);

    // Delete duplicate losers
    if (losers.length > 0) {
      const loserIds = losers.map((l) => l.id).join(', ');
      console.log(`  [PERSONAL DEDUP] uid=${winner.uid} keep=${winner.id} delete=${loserIds}`);
      if (!DRY_RUN) await Promise.all(losers.map((l) => l.ref.delete()));
      personalDeleted += losers.length;
    }

    // Rename winner if it has a role suffix
    const cleanName = stripRole(winner.data.name);
    if (cleanName !== winner.data.name) {
      // Compute the new ID (same formula as generateProductionId in productionDiff.ts)
      const studio = winner.data.studio || '';
      const date = winner.data.date || '';
      const key = `${cleanName}::${date}::${studio}`.toLowerCase().trim();
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const newId = Math.abs(hash).toString(36);

      if (newId !== winner.id) {
        console.log(`  [PERSONAL RENAME] ${winner.id} → ${newId} (name: "${winner.data.name}" → "${cleanName}")`);
        if (!DRY_RUN) {
          // Create new doc, delete old doc
          const newRef = winner.ref.parent.doc(newId);
          await newRef.set({ ...winner.data, id: newId, name: cleanName });
          await winner.ref.delete();
        }
        personalRenamed++;
      } else {
        // Same ID but name needs updating
        console.log(`  [PERSONAL UPDATE] ${winner.id} name: "${winner.data.name}" → "${cleanName}"`);
        if (!DRY_RUN) await winner.ref.update({ name: cleanName });
        personalRenamed++;
      }
    }
  }

  // Strip roles from no-herzliyaId personal entries too
  for (const { id, ref, data } of personalNoId) {
    const cleanName = stripRole(data.name);
    if (cleanName !== data.name) {
      console.log(`  [PERSONAL UPDATE] ${id} name: "${data.name}" → "${cleanName}"`);
      if (!DRY_RUN) await ref.update({ name: cleanName });
      personalRenamed++;
    }
  }

  console.log(`\n[cleanup-duplicates] Done.`);
  console.log(`  global_productions — Deleted: ${deletedCount} duplicates, Updated: ${updatedCount} names`);
  console.log(`  personal subcollections — Deleted: ${personalDeleted} duplicates, Renamed/Updated: ${personalRenamed} names`);
  if (DRY_RUN) console.log('  (DRY RUN — no changes written)');
}

main().catch((err) => {
  console.error('[cleanup-duplicates] Fatal error:', err);
  process.exit(1);
});
