import { createSign } from 'crypto';

type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type FirestorePrimitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | FirestorePrimitive[]
  | { [key: string]: FirestorePrimitive };

type FirestoreDocument = {
  name: string;
  fields?: Record<string, unknown>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getServiceAccount(): ServiceAccount {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || '';
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase admin service account is not configured');
  }

  return { projectId, clientEmail, privateKey };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Google access token: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

function getFirestoreBaseUrl(): string {
  const { projectId } = getServiceAccount();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function toFirestoreValue(value: FirestorePrimitive): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }

  const fields: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    fields[key] = toFirestoreValue(nestedValue as FirestorePrimitive);
  }
  return { mapValue: { fields } };
}

export function toFirestoreFields(data: Record<string, FirestorePrimitive>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function fromFirestoreValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue ?? '';
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: Array<Record<string, unknown>> }).values ?? [];
    return values.map((entry) => fromFirestoreValue(entry));
  }
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {};
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(fields)) {
      result[key] = fromFirestoreValue(nested);
    }
    return result;
  }
  return null;
}

export function fromFirestoreDocument<T = Record<string, unknown>>(document: FirestoreDocument): T {
  const rawFields = document.fields ?? {};
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    parsed[key] = fromFirestoreValue(value as Record<string, unknown>);
  }
  parsed.id = document.name.split('/').pop() || '';
  parsed._path = document.name.split('/documents/')[1] || '';
  return parsed as T;
}

export async function firestoreAdminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getAccessToken();
  const url = path.startsWith('http') ? path : `${getFirestoreBaseUrl()}/${path.replace(/^\/+/, '')}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

export async function listDocuments<T = Record<string, unknown>>(collectionPath: string): Promise<T[]> {
  const results: T[] = [];
  let nextPageToken = '';

  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (nextPageToken) query.set('pageToken', nextPageToken);
    const response = await firestoreAdminFetch(`${collectionPath}?${query.toString()}`);
    if (response.status === 404) return results;
    if (!response.ok) {
      throw new Error(`Failed to list ${collectionPath}: ${response.status} ${await response.text()}`);
    }
    const payload = (await response.json()) as {
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    };
    for (const document of payload.documents ?? []) {
      results.push(fromFirestoreDocument<T>(document));
    }
    nextPageToken = payload.nextPageToken || '';
  } while (nextPageToken);

  return results;
}

export async function getDocument<T = Record<string, unknown>>(documentPath: string): Promise<T | null> {
  const response = await firestoreAdminFetch(documentPath);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to get ${documentPath}: ${response.status} ${await response.text()}`);
  }
  return fromFirestoreDocument<T>((await response.json()) as FirestoreDocument);
}

export async function patchDocument(
  documentPath: string,
  data: Record<string, FirestorePrimitive>,
): Promise<void> {
  const searchParams = new URLSearchParams();
  for (const fieldPath of Object.keys(data)) {
    searchParams.append('updateMask.fieldPaths', fieldPath);
  }

  const response = await firestoreAdminFetch(
    `${documentPath}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields: toFirestoreFields(data) }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to patch ${documentPath}: ${response.status} ${await response.text()}`);
  }
}

export async function deleteDocument(documentPath: string): Promise<void> {
  const response = await firestoreAdminFetch(documentPath, {
    method: 'DELETE',
  });

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Failed to delete ${documentPath}: ${response.status} ${await response.text()}`);
  }
}

export async function runQuery<T = Record<string, unknown>>(structuredQuery: Record<string, unknown>): Promise<T[]> {
  const response = await firestoreAdminFetch(':runQuery', {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });

  if (!response.ok) {
    throw new Error(`Failed to run query: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  return payload
    .filter((entry) => entry.document)
    .map((entry) => fromFirestoreDocument<T>(entry.document!));
}
