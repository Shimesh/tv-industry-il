import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value
      .replace(/\\r\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .trim();
  }
  return env;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({
    iss: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(env.FIREBASE_ADMIN_PRIVATE_KEY);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`token failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

function fromFirestoreValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue ?? '';
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    const result = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields || {})) {
      result[key] = fromFirestoreValue(nested);
    }
    return result;
  }
  return null;
}

function fromDocument(document) {
  const result = {};
  for (const [key, value] of Object.entries(document.fields || {})) {
    result[key] = fromFirestoreValue(value);
  }
  result.id = document.name.split('/').pop();
  return result;
}

async function firestoreFetch(env, token, path) {
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  return fetch(`${base}/${path.replace(/^\/+/, '')}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

async function listDocuments(env, token, collectionPath) {
  const results = [];
  let nextPageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '1000' });
    if (nextPageToken) params.set('pageToken', nextPageToken);
    const response = await firestoreFetch(env, token, `${collectionPath}?${params.toString()}`);
    if (!response.ok) throw new Error(`list ${collectionPath} failed: ${response.status} ${await response.text()}`);
    const payload = await response.json();
    for (const document of payload.documents || []) {
      results.push(fromDocument(document));
    }
    nextPageToken = payload.nextPageToken || '';
  } while (nextPageToken);
  return results;
}

async function main() {
  const env = parseEnv(await readFile(new URL('../.env.vercel.tmp', import.meta.url), 'utf8'));
  const token = await getAccessToken(env);
  const contacts = await listDocuments(env, token, 'contacts');

  const counts = contacts.reduce((acc, contact) => {
    const key = contact.workArea || 'UNASSIGNED';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const unassigned = contacts
    .filter((contact) => !contact.workArea)
    .map((contact) => ({
      id: contact.id,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      role: contact.role || '',
      department: contact.department || '',
      specialty: contact.specialty || '',
      phone: contact.phone || '',
      source: contact.source || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  console.log(JSON.stringify({ counts, unassigned }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
