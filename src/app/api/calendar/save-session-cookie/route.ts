import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let sessionCookie: string;
  try {
    const body = await request.json() as { sessionCookie?: string };
    sessionCookie = typeof body.sessionCookie === 'string' ? body.sessionCookie.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  await patchDocument(`user_calendar_sync/${authUser.uid}`, {
    sessionCookie,
    sessionCookieSavedAt: Date.now(),
  } as unknown as Record<string, string>);

  return NextResponse.json({ ok: true });
}
