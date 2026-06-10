const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const index = line.indexOf('=');
  let value = line.slice(index + 1);
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  process.env[line.slice(0, index)] = value;
}

const runIdArg = process.argv.find((arg) => arg.startsWith('--run-id='));
const runId = runIdArg ? runIdArg.slice('--run-id='.length) : '';
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm-calendar-restore');

if (!runId) {
  throw new Error('Usage: node scripts/restore-calendar-snapshot.js --run-id=<id> [--apply --confirm-calendar-restore]');
}
if (apply && !confirmed) {
  throw new Error('Restore requires both --apply and --confirm-calendar-restore');
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

async function main() {
  const db = getFirestore();
  const snapshotRef = db.doc(`calendar_sync_snapshots/${runId}`);
  const snapshot = await snapshotRef.get();
  if (!snapshot.exists) throw new Error(`Snapshot ${runId} was not found`);

  const metadata = snapshot.data();
  const entries = await snapshotRef.collection('entries').get();
  const actions = [];

  for (const entry of entries.docs) {
    const data = entry.data();
    const productionId = String(data.productionId || '');
    if (!productionId) continue;
    const personalPath = `productions/${metadata.userId}/weeks/${metadata.weekId}/productions/${productionId}`;
    const globalPath = `global_productions/${productionId}`;
    if (data.restorePersonal !== false) {
      actions.push({ path: personalPath, action: data.beforePersonal ? 'restore' : 'delete', data: data.beforePersonal || null });
    }
    actions.push({ path: globalPath, action: data.beforeGlobal ? 'restore' : 'delete', data: data.beforeGlobal || null });
  }

  console.log(JSON.stringify({ runId, apply, metadata, actionCount: actions.length, actions }, null, 2));
  if (!apply) return;

  for (const action of actions) {
    const ref = db.doc(action.path);
    if (action.action === 'restore') await ref.set(action.data);
    else await ref.delete();
  }

  await snapshotRef.set({
    restoredAt: new Date().toISOString(),
    restoreActionCount: actions.length,
  }, { merge: true });
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
