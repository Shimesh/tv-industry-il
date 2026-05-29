/**
 * Google Calendar client-side integration.
 * All calendar API calls go through server-side routes (/api/calendar/event)
 * so tokens are managed securely and persist across sessions.
 */

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface CalendarSyncResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  error?: string;
  notConnected?: boolean;
  tokenRevoked?: boolean;
}

export interface ProductionForCalendar {
  id: string;
  name: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  studio?: string | null;
  notes?: string | null;
  crew?: { name: string; role: string }[];
}

function buildOAuthUrl(uid: string, returnPath: string, mode: 'popup' | 'redirect'): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured');

  const redirectUri = `${window.location.origin}/api/google/callback`;
  const state = btoa(JSON.stringify({ uid, returnPath, mode }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString()
  );
}

function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Opens OAuth popup (desktop) or redirects (mobile).
 * Resolves once the popup posts a message back (desktop only).
 * Mobile flow: page navigates away and returns via redirect.
 */
export function initiateGoogleCalendarConnect(
  uid: string,
  returnPath = '/settings',
): Promise<{ success: boolean; email?: string; error?: string }> {
  return new Promise((resolve) => {
    const mode = isMobileDevice() ? 'redirect' : 'popup';
    const authUrl = buildOAuthUrl(uid, returnPath, mode);

    if (mode === 'redirect') {
      window.location.href = authUrl;
      return; // Promise never resolves; page navigates away
    }

    const width = 500;
    const height = 620;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'google-calendar-auth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      resolve({ success: false, error: 'popup_blocked' });
      return;
    }

    const handleMessage = (event: MessageEvent<{
      type: string;
      success: boolean;
      email?: string;
      error?: string;
    }>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'google-auth-callback') return;
      cleanup();
      resolve({ success: event.data.success, email: event.data.email, error: event.data.error });
    };

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve({ success: false, error: 'popup_closed' });
      }
    }, 1000);

    function cleanup() {
      clearInterval(checkClosed);
      window.removeEventListener('message', handleMessage);
    }

    window.addEventListener('message', handleMessage);
  });
}

/**
 * Disconnect Google Calendar — removes stored tokens server-side.
 */
export async function disconnectGoogleCalendar(idToken: string): Promise<void> {
  await fetch('/api/calendar/disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

/**
 * Sync a single production to Google Calendar (server-side token management).
 */
export async function syncProductionToCalendar(
  idToken: string,
  production: ProductionForCalendar,
): Promise<CalendarSyncResult> {
  try {
    const res = await fetch('/api/calendar/event', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ production }),
    });

    const data = (await res.json()) as CalendarSyncResult & { error?: string; message?: string };

    if (res.status === 401) {
      return {
        success: false,
        notConnected: data.error === 'not_connected',
        tokenRevoked: data.error === 'token_revoked',
        error: data.message ?? data.error ?? 'לא מחובר',
      };
    }

    if (!res.ok) {
      return { success: false, error: data.error ?? 'שגיאה בסנכרון' };
    }

    return { success: true, eventId: data.eventId, eventUrl: data.eventUrl };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'שגיאה לא ידועה' };
  }
}

/**
 * Update an existing Google Calendar event.
 */
export async function updateProductionInCalendar(
  idToken: string,
  eventId: string,
  production: ProductionForCalendar,
): Promise<CalendarSyncResult> {
  try {
    const res = await fetch('/api/calendar/event', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId, production }),
    });

    const data = (await res.json()) as CalendarSyncResult & { error?: string };
    if (!res.ok) return { success: false, error: data.error ?? 'שגיאה בעדכון', notConnected: res.status === 401 };
    return { success: true, eventId: data.eventId, eventUrl: data.eventUrl };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'שגיאה לא ידועה' };
  }
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteProductionFromCalendar(
  idToken: string,
  eventId: string,
): Promise<CalendarSyncResult> {
  try {
    const res = await fetch(`/api/calendar/event?eventId=${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return { success: false, notConnected: res.status === 401 };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'שגיאה לא ידועה' };
  }
}
