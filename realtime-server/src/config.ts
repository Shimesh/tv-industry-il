import dotenv from 'dotenv';

dotenv.config();

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const realtimeConfig = {
  port: Number(process.env.PORT || 4001),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'tv-industry-il',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  persistenceMode: process.env.CHAT_V2_PERSISTENCE_MODE || 'firestore',
  allowAnonymousFallback: parseBoolean(process.env.CHAT_V2_ALLOW_ANON_FALLBACK, false),
};

export function getFirebaseServiceAccountJson(): Record<string, unknown> | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson) as Record<string, unknown>;
  }

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64) {
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  return null;
}

