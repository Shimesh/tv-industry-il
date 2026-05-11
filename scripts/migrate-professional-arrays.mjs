import { readFile } from 'node:fs/promises';
import admin from 'firebase-admin';

const dryRun = process.argv.includes('--dry-run');
const collections = ['users', 'contacts'];

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value.replace(/\\n/g, '\n').trim();
  }
  return env;
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value) continue;
    const key = value.toLocaleLowerCase('he');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function arrayField(value) {
  return Array.isArray(value) ? unique(value.map(clean)) : unique([clean(value)]);
}

function normalizeRole(value) {
  const role = clean(value);
  const lower = role.toLocaleLowerCase('he');
  if (!role) return '';
  if (/^(vision mixer|video mixer|switcher|מיקסר|וידאו|מיקסר\/וידאו)$/iu.test(lower)) return 'מיקסר/וידאו';
  if (/^(ניתוב|נתב)$/iu.test(lower)) return 'נתב';
  if (/^(director|במאי|בימוי)$/iu.test(lower)) return 'במאי';
  return role;
}

function inferDepartment(role) {
  if (/^(מיקסר\/וידאו|נתב|VTR|LSM|CCU|CG)$/iu.test(role)) return 'טכני';
  if (/^(במאי|ע\. במאי|מפיק|עורך)$/iu.test(role)) return 'הפקה';
  if (/^(סאונד|קול)$/iu.test(role)) return 'סאונד';
  if (/^(תאורן|תאורה)$/iu.test(role)) return 'תאורה';
  if (/^(צלם|צילום)$/iu.test(role)) return 'צילום';
  return '';
}

function fullName(data) {
  return clean(data.displayName || data.crewName || `${data.firstName || ''} ${data.lastName || ''}`);
}

function normalizedFields(data) {
  let roles = unique([...arrayField(data.roles), ...arrayField(data.role), ...arrayField(data.specialty)].map(normalizeRole));
  let departments = unique([...arrayField(data.departments), ...arrayField(data.department)]);
  const name = fullName(data).toLocaleLowerCase('he');

  if (/(^|\s)(ben forman|בן פורמן)(\s|$)/iu.test(name)) {
    roles = unique([...roles, 'מיקסר/וידאו']);
    departments = unique([...departments, 'טכני']);
  }

  departments = unique([...departments, ...roles.map(inferDepartment)]);

  return {
    roles,
    departments,
    role: roles[0] || '',
    department: departments[0] || '',
  };
}

function needsUpdate(data, next) {
  return JSON.stringify(arrayField(data.roles)) !== JSON.stringify(next.roles) ||
    JSON.stringify(arrayField(data.departments)) !== JSON.stringify(next.departments) ||
    clean(data.role) !== next.role ||
    clean(data.department) !== next.department;
}

const env = parseEnv(await readFile('.env.local', 'utf8'));
const projectId = env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Missing Firebase Admin credentials in .env.local');
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();
let scanned = 0;
let updated = 0;
let benFormanMatches = 0;

for (const collectionName of collections) {
  const snapshot = await db.collection(collectionName).get();
  console.log(`${collectionName}: ${snapshot.size} documents`);
  let batch = db.batch();
  let batchUpdates = 0;

  for (const doc of snapshot.docs) {
    scanned++;
    const data = doc.data();
    const next = normalizedFields(data);
    const name = fullName(data);
    if (/(^|\s)(ben forman|בן פורמן)(\s|$)/iu.test(name.toLocaleLowerCase('he'))) {
      benFormanMatches++;
      console.log(`Ben Forman match in ${collectionName}/${doc.id}: roles=${next.roles.join(', ')} departments=${next.departments.join(', ')}`);
    }
    if (!needsUpdate(data, next)) continue;

    updated++;
    batchUpdates++;
    if (dryRun) {
      console.log(`[dry-run] ${collectionName}/${doc.id}: roles=${next.roles.join(', ')} departments=${next.departments.join(', ')}`);
    } else {
      batch.update(doc.ref, {
        ...next,
        updatedAt: new Date().toISOString(),
      });
    }

    if (!dryRun && batchUpdates === 450) {
      await batch.commit();
      batch = db.batch();
      batchUpdates = 0;
    }
  }

  if (!dryRun && batchUpdates > 0) {
    await batch.commit();
  }
}

console.log(JSON.stringify({ dryRun, scanned, updated, benFormanMatches }, null, 2));
