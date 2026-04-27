import { createHash, createSign } from 'node:crypto';
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

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value = null) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
}

function normalizeRole(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function splitName(name) {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function classifyRole(rawRole = '') {
  const text = normalizeRole(rawRole).toLowerCase();

  const tests = [
    { match: /(^|\s)vtr(\s|$)|וידאו טייפ|וי טי אר/u, department: 'טכני', workArea: 'קונטרול', specialty: 'VTR' },
    { match: /(^|\s)lsm(\s|$)|איטנרום|אינטרום|הילוך חוזר/u, department: 'טכני', workArea: 'קונטרול', specialty: 'LSM' },
    { match: /(^|\s)ccu(\s|$)/u, department: 'טכני', workArea: 'קונטרול', specialty: 'CCU' },
    { match: /(^|\s)cg(\s|$)|גרפיקה|כתוביות|caption/u, department: 'טכני', workArea: 'קונטרול', specialty: /כתוביות|caption/u.test(text) ? 'כתוביות' : 'CG' },
    { match: /פרומפטר|teleprompter/u, department: 'טכני', workArea: 'קונטרול', specialty: 'פרומפטר' },
    { match: /נתב|ניתוב|vision mixer|מיקסר|וידאו/u, department: 'טכני', workArea: 'קונטרול', specialty: /מיקסר|vision/u.test(text) ? 'מיקסר/וידאו' : 'נתב' },
    { match: /במאי/u, department: 'הפקה', workArea: 'קונטרול', specialty: /ע\.?\s?במאי|עוזר.?במאי/u.test(text) ? 'ע. במאי' : 'במאי' },
    { match: /סאונד|קול|boom|מקליט/u, department: 'סאונד', workArea: 'קונטרול', specialty: 'סאונד' },
    { match: /ע\.?\s?צלם|עוזר.?צלם/u, department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
    { match: /רחפן|רחף|drone/u, department: 'צילום', workArea: 'אולפן', specialty: 'צלם רחף/רחפן' },
    { match: /סטדי|steadicam/u, department: 'צילום', workArea: 'אולפן', specialty: 'סטדי' },
    { match: /צלם|צילום|camera/u, department: 'צילום', workArea: 'אולפן', specialty: 'צלם' },
    { match: /מנהל.?במה|במה/u, department: 'הפקה', workArea: 'אולפן', specialty: 'מנהל במה' },
    { match: /בקליינר|backliner/u, department: 'טכני', workArea: 'אולפן', specialty: 'בקליינר' },
    { match: /תאורן|תאורה|light/u, department: 'תאורה', workArea: 'אולפן', specialty: 'תאורן' },
    { match: /גריפ|grip/u, department: 'טכני', workArea: 'אולפן', specialty: 'גריפ' },
    { match: /תפאורן|תפאורה|set/u, department: 'הפקה', workArea: 'אולפן', specialty: 'תפאורן' },
    { match: /מפיק|הפקה|producer/u, department: 'הפקה', workArea: 'הפקה', specialty: 'מפיק' },
    { match: /תחקירן|תחקיר/u, department: 'הפקה', workArea: 'הפקה', specialty: 'תחקירן' },
    { match: /עורך|עריכה|edit|editor/u, department: 'הפקה', workArea: 'פוסט', specialty: 'עורך' },
  ];

  for (const rule of tests) {
    if (rule.match.test(text)) {
      return { department: rule.department, workArea: rule.workArea, specialty: rule.specialty };
    }
  }

  return { department: 'טכני', workArea: 'קונטרול', specialty: 'טכני' };
}

const CANONICAL_NAME_OVERRIDES = [
  {
    match: /מוניר\s+אברהים/iu,
    classification: { department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  },
  {
    match: /חוסאם\s+אלסוס/iu,
    classification: { department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  },
];

function classifyCrewMember(name = '', rawRole = '') {
  const normalizedName = normalizeName(name);
  for (const override of CANONICAL_NAME_OVERRIDES) {
    if (override.match.test(normalizedName)) {
      return override.classification;
    }
  }
  return classifyRole(rawRole);
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(env.FIREBASE_ADMIN_PRIVATE_KEY);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
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
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('nullValue' in value) return null;
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

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  const fields = {};
  for (const [key, nested] of Object.entries(value)) {
    fields[key] = toFirestoreValue(nested);
  }
  return { mapValue: { fields } };
}

function toFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function fromDocument(document) {
  const result = {};
  for (const [key, value] of Object.entries(document.fields || {})) {
    result[key] = fromFirestoreValue(value);
  }
  result.id = document.name.split('/').pop();
  result._path = document.name.split('/documents/')[1] || '';
  return result;
}

async function firestoreFetch(env, token, path, init = {}) {
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  return fetch(`${base}/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
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
    if (response.status === 404) return results;
    if (!response.ok) throw new Error(`list ${collectionPath} failed: ${response.status} ${await response.text()}`);
    const payload = await response.json();
    for (const document of payload.documents || []) {
      results.push(fromDocument(document));
    }
    nextPageToken = payload.nextPageToken || '';
  } while (nextPageToken);
  return results;
}

async function runQuery(env, token, structuredQuery) {
  const response = await firestoreFetch(env, token, ':runQuery', {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });
  if (!response.ok) throw new Error(`runQuery failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  return payload.filter((entry) => entry.document).map((entry) => fromDocument(entry.document));
}

async function patchDocument(env, token, documentPath, data) {
  const params = new URLSearchParams();
  for (const key of Object.keys(data)) {
    params.append('updateMask.fieldPaths', key);
  }
  const response = await firestoreFetch(env, token, `${documentPath}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!response.ok) throw new Error(`patch ${documentPath} failed: ${response.status} ${await response.text()}`);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function buildDocId(identityKey) {
  return `schedule-${createHash('sha1').update(identityKey).digest('hex').slice(0, 20)}`;
}

function mergeSources(existing, candidateSources) {
  return uniqueStrings([...(existing.sources || []), existing.source || '', ...candidateSources]);
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const env = parseEnv(await readFile(new URL('../.env.vercel.tmp', import.meta.url), 'utf8'));
  const token = await getAccessToken(env);

  const contacts = await listDocuments(env, token, 'contacts');
  const productions = await runQuery(env, token, {
    from: [{ collectionId: 'productions', allDescendants: true }],
  });

  const scopedProductions = productions.filter((production) => String(production._path || '').includes('/weeks/') && Array.isArray(production.crew));
  const flattened = [];
  for (const production of scopedProductions) {
    for (const member of production.crew || []) {
      flattened.push({
        name: member.name || '',
        role: member.role || '',
        roleDetail: member.roleDetail || '',
        phone: member.phone || null,
      });
    }
  }

  const candidates = [];
  const seenCandidates = new Set();
  for (const member of flattened) {
    const normalizedName = normalizeName(member.name);
    if (!normalizedName) continue;
    const normalizedPhone = normalizePhone(member.phone);
    const identityKey = normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName;
    const dedupeKey = `${identityKey}::${normalizeRole(member.roleDetail || member.role || '')}`;
    if (seenCandidates.has(dedupeKey)) continue;
    seenCandidates.add(dedupeKey);
    const role = normalizeRole(member.roleDetail || member.role || '');
    const { department, workArea, specialty } = classifyCrewMember(normalizedName, role);
    const { firstName, lastName } = splitName(normalizedName);
    candidates.push({
      normalizedName,
      normalizedPhone,
      identityKey,
      firstName,
      lastName,
      role,
      department,
      workArea,
      specialty,
      partialContact: !normalizedPhone,
      sources: ['schedule'],
    });
  }

  const byPhone = new Map();
  const byComposite = new Map();
  const byNameWithoutPhone = new Map();
  const byNameWithPhone = new Map();

  for (const contact of contacts) {
    const normalizedName = normalizeName(contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`);
    const normalizedPhone = normalizePhone(contact.normalizedPhone || contact.phone || null);
    const enriched = { ...contact, normalizedName, normalizedPhone };
    if (normalizedPhone) {
      byPhone.set(normalizedPhone, enriched);
      byComposite.set(`${normalizedName}::${normalizedPhone}`, enriched);
      if (normalizedName) byNameWithPhone.set(normalizedName, enriched);
    } else if (normalizedName) {
      byNameWithoutPhone.set(normalizedName, enriched);
    }
  }

  let created = 0;
  let updated = 0;
  let ophirFound = false;

  for (const candidate of candidates) {
    if (candidate.normalizedName.includes('אופיר מגדל')) ophirFound = true;
    const existing =
      (candidate.normalizedPhone && byPhone.get(candidate.normalizedPhone)) ||
      (candidate.normalizedPhone && byComposite.get(candidate.identityKey)) ||
      (!candidate.normalizedPhone ? byNameWithoutPhone.get(candidate.normalizedName) : null) ||
      (!candidate.normalizedPhone ? byNameWithPhone.get(candidate.normalizedName) : null) ||
      null;

    const mergedPhone = existing?.phone || candidate.normalizedPhone;
    const merged = {
      firstName: existing?.firstName || candidate.firstName,
      lastName: existing?.lastName || candidate.lastName,
      phone: mergedPhone,
      role: existing?.role || candidate.role,
      department: existing?.department && !['אולפן', 'קונטרול', 'כללי'].includes(existing.department) ? existing.department : candidate.department,
      workArea: existing?.workArea || candidate.workArea,
      specialty: existing?.specialty || candidate.specialty,
      normalizedName: candidate.normalizedName,
      normalizedPhone: mergedPhone || null,
      identityKey: mergedPhone ? `${candidate.normalizedName}::${mergedPhone}` : candidate.normalizedName,
      partialContact: !mergedPhone,
      source: existing?.source || 'schedule',
      sources: mergeSources(existing || {}, candidate.sources),
      updatedAt: nowIso(),
      ...(existing ? {} : { createdAt: nowIso() }),
    };

    if (!existing) {
      created += 1;
      const docId = buildDocId(candidate.identityKey);
      await patchDocument(env, token, `contacts/${docId}`, merged);
      const createdRecord = { id: docId, ...merged };
      if (candidate.normalizedPhone) {
        byPhone.set(candidate.normalizedPhone, createdRecord);
        byComposite.set(candidate.identityKey, createdRecord);
        byNameWithPhone.set(candidate.normalizedName, createdRecord);
      } else {
        byNameWithoutPhone.set(candidate.normalizedName, createdRecord);
      }
      continue;
    }

    const needsUpdate =
      existing.department !== merged.department ||
      (existing.workArea || null) !== (merged.workArea || null) ||
      existing.specialty !== merged.specialty ||
      existing.role !== merged.role ||
      existing.normalizedName !== merged.normalizedName ||
      existing.normalizedPhone !== merged.normalizedPhone ||
      JSON.stringify(existing.sources || []) !== JSON.stringify(merged.sources);

    if (needsUpdate) {
      updated += 1;
      await patchDocument(env, token, `contacts/${existing.id}`, merged);
    }
  }

  const contactsAfter = await listDocuments(env, token, 'contacts');
  let recategorized = 0;
  for (const contact of contactsAfter) {
    const role = normalizeRole(contact.role || '');
    const { department, workArea, specialty } = classifyCrewMember(`${contact.firstName || ''} ${contact.lastName || ''}`, role);
    if (contact.department === department && (contact.workArea || null) === workArea && contact.specialty === specialty) {
      continue;
    }
    recategorized += 1;
    await patchDocument(env, token, `contacts/${contact.id}`, {
      department,
      workArea,
      specialty,
      updatedAt: nowIso(),
    });
  }

  const finalContacts = await listDocuments(env, token, 'contacts');
  console.log(JSON.stringify({
    productionsScanned: scopedProductions.length,
    candidates: candidates.length,
    created,
    updated,
    recategorized,
    totalContacts: finalContacts.length,
    ophirFoundInProductions: ophirFound,
    ophirExistsInContacts: finalContacts.some((contact) => normalizeName(`${contact.firstName || ''} ${contact.lastName || ''}`).includes('אופיר מגדל')),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
