import { getDocument, patchDocument } from './firestoreAdminRest';

export interface StoredGoogleCalendarToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  googleEmail: string;
  connectedAt: number;
}

const TOKEN_BUFFER_MS = 5 * 60 * 1000;

export async function saveGoogleCalendarTokens(
  uid: string,
  tokens: {
    access_token: string;
    refresh_token?: string | null;
    expires_in: number;
    email: string;
  },
): Promise<void> {
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  let refreshToken = tokens.refresh_token ?? null;
  if (!refreshToken) {
    const existing = await getDocument<{ googleCalendarToken?: StoredGoogleCalendarToken }>(
      `users/${uid}`,
    );
    refreshToken = existing?.googleCalendarToken?.refreshToken ?? null;
  }

  await patchDocument(`users/${uid}`, {
    googleCalendarToken: {
      accessToken: tokens.access_token,
      refreshToken: refreshToken ?? '',
      expiresAt,
      googleEmail: tokens.email,
      connectedAt: Date.now(),
    },
    googleCalendarConnected: true,
    googleCalendarEmail: tokens.email,
  });
}

export async function getValidGoogleToken(uid: string): Promise<string | null> {
  const doc = await getDocument<{ googleCalendarToken?: StoredGoogleCalendarToken }>(
    `users/${uid}`,
  );
  const stored = doc?.googleCalendarToken;
  if (!stored?.refreshToken) return null;

  if (stored.accessToken && stored.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return stored.accessToken;
  }

  const refreshed = await refreshGoogleToken(stored.refreshToken);
  if (!refreshed) {
    await clearGoogleCalendarTokens(uid);
    return null;
  }

  const newExpiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
  await patchDocument(`users/${uid}`, {
    googleCalendarToken: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
      expiresAt: newExpiresAt,
      googleEmail: stored.googleEmail,
      connectedAt: stored.connectedAt,
    },
  });

  return refreshed.access_token;
}

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
  } catch {
    return null;
  }
}

export async function clearGoogleCalendarTokens(uid: string): Promise<void> {
  await patchDocument(`users/${uid}`, {
    googleCalendarToken: null,
    googleCalendarConnected: false,
    googleCalendarEmail: null,
  });
}
