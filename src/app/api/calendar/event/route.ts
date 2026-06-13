import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getValidGoogleToken, clearGoogleCalendarTokens } from '@/lib/server/googleCalendarTokens';

export const runtime = 'nodejs';

interface ProductionInput {
  id: string;
  name: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  studio?: string | null;
  notes?: string | null;
  crew?: { name: string; role: string }[];
}

function normalizeTime(t: string | null | undefined, fallback: string): string {
  const raw = (t && t.trim()) || fallback;
  // Accept "HH:MM" or "HH:MM:SS" — always return "HH:MM"
  return raw.slice(0, 5);
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildCalendarEvent(production: ProductionInput) {
  const rawStart = normalizeTime(production.startTime, '09:00');
  const rawEnd = normalizeTime(production.endTime, '18:00');
  const dateStr = production.date;

  // Handle times past midnight (e.g. "25:00" → next day "01:00")
  const startHours = parseInt(rawStart.slice(0, 2), 10);
  const endHours = parseInt(rawEnd.slice(0, 2), 10);

  const startOverflow = Math.floor(startHours / 24);
  const endOverflow = Math.floor(endHours / 24);

  const startDateStr = startOverflow > 0 ? addDaysToDate(dateStr, startOverflow) : dateStr;
  const endDateStr = endOverflow > 0 ? addDaysToDate(dateStr, endOverflow) : dateStr;

  const startTime = `${String(startHours % 24).padStart(2, '0')}:${rawStart.slice(3)}`;
  const endTime = `${String(endHours % 24).padStart(2, '0')}:${rawEnd.slice(3)}`;

  const crewText = (production.crew ?? [])
    .map((c) => `${c.name}${c.role ? ` — ${c.role}` : ''}`)
    .join('\n');

  const descriptionParts = [
    production.studio ? `אולפן: ${production.studio}` : '',
    production.notes ? `הערות: ${production.notes}` : '',
    crewText ? `\nצוות:\n${crewText}` : '',
    '\n---\nסונכרן מ-TV Industry IL',
  ].filter(Boolean);

  return {
    summary: production.name,
    description: descriptionParts.join('\n'),
    location: production.studio ?? '',
    start: { dateTime: `${startDateStr}T${startTime}:00`, timeZone: 'Asia/Jerusalem' },
    end: { dateTime: `${endDateStr}T${endTime}:00`, timeZone: 'Asia/Jerusalem' },
    extendedProperties: {
      private: { tvIndustryProductionId: production.id, source: 'tv-industry-il' },
    },
  };
}

async function callGoogleAPI(
  method: string,
  url: string,
  accessToken: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// POST /api/calendar/event — create event
export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const body = (await request.json()) as { production: ProductionInput };
  if (!body.production) {
    return NextResponse.json({ error: 'missing production' }, { status: 400 });
  }

  const accessToken = await getValidGoogleToken(authUser.uid);
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected', message: 'Google Calendar לא מחובר' }, { status: 401 });
  }

  if (!body.production.date) {
    return NextResponse.json({ error: 'תאריך חסר בהפקה' }, { status: 400 });
  }

  const event = buildCalendarEvent(body.production);
  const result = await callGoogleAPI(
    'POST',
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    accessToken,
    event,
  );

  if (result.status === 401) {
    await clearGoogleCalendarTokens(authUser.uid);
    return NextResponse.json({ error: 'token_revoked', message: 'נדרש חיבור מחדש ל-Google Calendar' }, { status: 401 });
  }

  if (!result.ok) {
    const errMsg = (result.data as { error?: { message?: string } })?.error?.message ?? 'שגיאה ביצירת אירוע';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  const created = result.data as { id: string; htmlLink: string };
  return NextResponse.json({ success: true, eventId: created.id, eventUrl: created.htmlLink });
}

// PUT /api/calendar/event — update event
export async function PUT(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const body = (await request.json()) as { eventId: string; production: ProductionInput };
  if (!body.eventId || !body.production) {
    return NextResponse.json({ error: 'missing eventId or production' }, { status: 400 });
  }

  const accessToken = await getValidGoogleToken(authUser.uid);
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  const event = buildCalendarEvent(body.production);
  const result = await callGoogleAPI(
    'PUT',
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${body.eventId}`,
    accessToken,
    event,
  );

  if (result.status === 401) {
    await clearGoogleCalendarTokens(authUser.uid);
    return NextResponse.json({ error: 'token_revoked' }, { status: 401 });
  }

  if (!result.ok) {
    const errMsg = (result.data as { error?: { message?: string } })?.error?.message ?? 'שגיאה בעדכון אירוע';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  const updated = result.data as { id: string; htmlLink: string };
  return NextResponse.json({ success: true, eventId: updated.id, eventUrl: updated.htmlLink });
}

// DELETE /api/calendar/event — delete event
export async function DELETE(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const eventId = searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'missing eventId' }, { status: 400 });

  const accessToken = await getValidGoogleToken(authUser.uid);
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 401 });

  const result = await callGoogleAPI(
    'DELETE',
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    accessToken,
  );

  if (result.status === 401) {
    await clearGoogleCalendarTokens(authUser.uid);
    return NextResponse.json({ error: 'token_revoked' }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
