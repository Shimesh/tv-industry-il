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

function buildCalendarEvent(production: ProductionInput) {
  const startTime = production.startTime || '09:00';
  const endTime = production.endTime || '18:00';
  const dateStr = production.date;

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
    start: { dateTime: `${dateStr}T${startTime}:00`, timeZone: 'Asia/Jerusalem' },
    end: { dateTime: `${dateStr}T${endTime}:00`, timeZone: 'Asia/Jerusalem' },
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
    return NextResponse.json({ error: 'שגיאה בעדכון אירוע' }, { status: 500 });
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
