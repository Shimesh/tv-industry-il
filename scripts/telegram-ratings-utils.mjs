import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const TARGET_AUDIENCE = 'משקי בית בכלל האוכלוסייה';

export function loadEnvFile(path) {
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] ??= value;
    }
  } catch {
    // .env.local is optional; explicit environment variables still work.
  }
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeChannel(value) {
  const cleaned = normalizeWhitespace(value).replace(/^[,-]\s*/, '').replace(/\s*[,-]$/, '');
  if (!cleaned) return '';
  if (/^(?:11|כאן|kan)$/i.test(cleaned)) return 'כאן';
  if (/^(?:12|קשת)$/i.test(cleaned)) return '12';
  if (/^(?:13|רשת)$/i.test(cleaned)) return '13';
  if (/^(?:14|עכשיו\s*14)$/i.test(cleaned)) return '14';
  if (/^i24$/i.test(cleaned)) return 'i24';
  return cleaned;
}

function parsePercent(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

function parseViewers(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*k\b/i);
  return match ? Number(match[1]) : 0;
}

function parseSourceDate(message, fallbackDate = new Date()) {
  const match = message.match(/לתאריך\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/u);
  if (!match) {
    return fallbackDate.toISOString().slice(0, 10);
  }

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear.padStart(4, '0');
  return `${year}-${month}-${day}`;
}

function formatSourceDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function extractRankedSegments(section) {
  const matches = Array.from(section.matchAll(/#(\d+)\s+/g));
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || section.length : section.length;
    return {
      sourceRank: Number(match[1]),
      text: normalizeWhitespace(section.slice(start, end)),
    };
  });
}

function splitSections(message) {
  const compact = normalizeWhitespace(message);
  const newsStart = compact.indexOf('בחדשות');
  const primeStart = compact.indexOf('בפריים טיים');
  const endMarkers = [
    compact.indexOf('רייטינג יומי מבית'),
    compact.indexOf('לתאריך'),
  ].filter((index) => index >= 0);
  const end = endMarkers.length ? Math.min(...endMarkers) : compact.length;

  return {
    news: newsStart >= 0
      ? compact.slice(newsStart + 'בחדשות'.length, primeStart >= 0 ? primeStart : end)
      : '',
    prime: primeStart >= 0
      ? compact.slice(primeStart + 'בפריים טיים'.length, end)
      : '',
  };
}

function stripTrend(value) {
  return value
    .replace(/[⬆⬇↗️↘️]+/gu, ' ')
    .replace(/\b(?:עלייה|ירידה)\b/gu, ' ')
    .trim();
}

function parseRankedItem(segment) {
  const text = stripTrend(segment.text);
  const ratingPercent = parsePercent(text);
  if (!ratingPercent) return null;

  const viewers = parseViewers(text);
  const percentIndex = text.search(/\d+(?:\.\d+)?\s*%/);
  const beforePercent = normalizeWhitespace(text.slice(0, percentIndex).replace(/\d+(?:\.\d+)?k\b/gi, ''));
  const afterPercent = normalizeWhitespace(text.slice(percentIndex).replace(/^\d+(?:\.\d+)?\s*%\s*/, ''));

  let showName = '';
  let channel = '';

  const commaMatch = beforePercent.match(/^(.*?),\s*([^\s,]+)\s*-\s*$/u);
  const dashMatch = beforePercent.match(/^(.*?)\s*-\s*$/u);
  const trailingChannelMatch = beforePercent.match(/^(.*?)\s+(i24|11|12|13|14|55|כאן)\s*-\s*$/iu);
  const channelAfterPercentMatch = afterPercent.match(/-\s*(i24|11|12|13|14|55|כאן)\b/iu);

  if (commaMatch) {
    showName = commaMatch[1];
    channel = commaMatch[2];
  } else if (trailingChannelMatch) {
    showName = trailingChannelMatch[1];
    channel = trailingChannelMatch[2];
  } else if (channelAfterPercentMatch) {
    showName = beforePercent.replace(/\d+(?:\.\d+)?k\b/gi, '').replace(/\s*-\s*$/u, '');
    channel = channelAfterPercentMatch[1];
  } else if (dashMatch) {
    showName = dashMatch[1];
  } else {
    showName = beforePercent.replace(/\s*-\s*$/u, '');
  }

  showName = normalizeWhitespace(showName.replace(/\d+(?:\.\d+)?k\b/gi, ''));
  channel = normalizeChannel(channel);

  if (!showName) return null;

  return {
    rank: segment.sourceRank,
    showName,
    channel,
    viewers,
    ratingPercent,
  };
}

function parseSection(sectionText) {
  return extractRankedSegments(sectionText)
    .map(parseRankedItem)
    .filter(Boolean)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function parseScoptRatingsMessage(message, fallbackDate = new Date()) {
  const text = normalizeWhitespace(message);
  if (!text.includes('רייטינג') || !text.includes('Scopt')) return null;

  const date = parseSourceDate(text, fallbackDate);
  const sections = splitSections(text);
  const telegramHouseholds = parseSection(sections.news);
  const telegramPrime = parseSection(sections.prime);

  if (!telegramHouseholds.length && !telegramPrime.length) return null;

  return {
    date,
    sourceDate: formatSourceDate(date),
    targetAudience: TARGET_AUDIENCE,
    telegramHouseholds,
    telegramPrime,
    telegramFetchedAt: new Date().toISOString(),
    fallbackUsed: false,
  };
}

export function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getServiceAccount() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';
  const privateKey = (
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    ''
  ).replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase admin service account is not configured');
  }

  return { projectId, clientEmail, privateKey };
}

export async function getAccessToken() {
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({
    iss: serviceAccount.clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(serviceAccount.privateKey))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Google access token: ${response.status} ${await response.text()}`);
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
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((entry) => fromFirestoreValue(entry));
  }
  if ('mapValue' in value) {
    const result = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields ?? {})) {
      result[key] = fromFirestoreValue(nested);
    }
    return result;
  }
  return null;
}

export async function getFirestoreDocument(documentPath) {
  const { projectId } = getServiceAccount();
  const token = await getAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to get ${documentPath}: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const parsed = {};
  for (const [key, value] of Object.entries(payload.fields ?? {})) {
    parsed[key] = fromFirestoreValue(value);
  }
  return parsed;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }

  const fields = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    fields[key] = toFirestoreValue(nestedValue);
  }
  return { mapValue: { fields } };
}

export async function patchFirestoreDocument(documentPath, data) {
  const { projectId } = getServiceAccount();
  const token = await getAccessToken();
  const searchParams = new URLSearchParams();
  for (const fieldPath of Object.keys(data)) {
    searchParams.append('updateMask.fieldPaths', fieldPath);
  }
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?${searchParams}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to patch ${documentPath}: ${response.status} ${await response.text()}`);
  }
}
