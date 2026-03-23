/**
 * Google Calendar Integration
 * Sync productions to/from Google Calendar
 */

const GOOGLE_CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar';

interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string; displayName?: string }[];
  extendedProperties?: {
    private: Record<string, string>;
  };
}

interface CalendarSyncResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  error?: string;
}

/**
 * Initialize Google OAuth and get access token
 */
export async function getGoogleAuthToken(): Promise<string | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('Google Client ID not configured');
    return null;
  }

  return new Promise((resolve) => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const redirectUri = `${window.location.origin}/api/google/callback`;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(GOOGLE_CALENDAR_SCOPES)}` +
      `&prompt=consent`;

    const popup = window.open(
      authUrl,
      'google-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Listen for the callback with the token
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'google-auth-callback') {
        window.removeEventListener('message', handleMessage);
        resolve(event.data.accessToken || null);
      }
    };

    window.addEventListener('message', handleMessage);

    // Fallback: check if popup was closed without auth
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        resolve(null);
      }
    }, 1000);
  });
}

/**
 * Create a Google Calendar event from a production
 */
export async function createCalendarEvent(
  accessToken: string,
  production: {
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    studio: string;
    notes: string;
    crew: { name: string; role: string; department: string }[];
    id: string;
  }
): Promise<CalendarSyncResult> {
  try {
    const startDateTime = `${production.date}T${production.startTime || '09:00'}:00`;
    const endDateTime = `${production.date}T${production.endTime || '18:00'}:00`;

    const crewList = production.crew
      .map(c => `${c.name} (${c.role} - ${c.department})`)
      .join('\n');

    const event: GoogleCalendarEvent = {
      summary: production.name,
      description: [
        production.notes ? `הערות: ${production.notes}` : '',
        production.studio ? `אולפן: ${production.studio}` : '',
        crewList ? `\nצוות:\n${crewList}` : '',
        `\n---\nסונכרן מ-TV Industry IL`,
      ].filter(Boolean).join('\n'),
      location: production.location || production.studio || '',
      start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Jerusalem' },
      extendedProperties: {
        private: {
          tvIndustryProductionId: production.id,
          source: 'tv-industry-il',
        },
      },
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || 'שגיאה ביצירת אירוע' };
    }

    const created = await response.json();
    return {
      success: true,
      eventId: created.id,
      eventUrl: created.htmlLink,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'שגיאה לא ידועה',
    };
  }
}

/**
 * Update an existing Google Calendar event
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  production: {
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    studio: string;
    notes: string;
    crew: { name: string; role: string; department: string }[];
    id: string;
  }
): Promise<CalendarSyncResult> {
  try {
    const startDateTime = `${production.date}T${production.startTime || '09:00'}:00`;
    const endDateTime = `${production.date}T${production.endTime || '18:00'}:00`;

    const crewList = production.crew
      .map(c => `${c.name} (${c.role} - ${c.department})`)
      .join('\n');

    const event: GoogleCalendarEvent = {
      summary: production.name,
      description: [
        production.notes ? `הערות: ${production.notes}` : '',
        production.studio ? `אולפן: ${production.studio}` : '',
        crewList ? `\nצוות:\n${crewList}` : '',
        `\n---\nסונכרן מ-TV Industry IL`,
      ].filter(Boolean).join('\n'),
      location: production.location || production.studio || '',
      start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Jerusalem' },
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || 'שגיאה בעדכון אירוע' };
    }

    const updated = await response.json();
    return {
      success: true,
      eventId: updated.id,
      eventUrl: updated.htmlLink,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'שגיאה לא ידועה',
    };
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<CalendarSyncResult> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      return { success: false, error: 'שגיאה במחיקת אירוע' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'שגיאה לא ידועה',
    };
  }
}

/**
 * Fetch events from Google Calendar for a date range
 */
export async function fetchCalendarEvents(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<{ events: GoogleCalendarEvent[]; error?: string }> {
  try {
    const timeMin = `${startDate}T00:00:00+03:00`;
    const timeMax = `${endDate}T23:59:59+03:00`;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true` +
      `&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return { events: [], error: 'שגיאה בשליפת אירועים' };
    }

    const data = await response.json();
    return { events: data.items || [] };
  } catch (error) {
    return {
      events: [],
      error: error instanceof Error ? error.message : 'שגיאה לא ידועה',
    };
  }
}
