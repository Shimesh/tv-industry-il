import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let sessionCookie: string;
  let herzliyaUser: string;
  let herzliyaPass: string;
  try {
    const body = await request.json() as { sessionCookie?: string; herzliyaUser?: string; herzliyaPass?: string };
    sessionCookie = typeof body.sessionCookie === 'string' ? body.sessionCookie.trim() : '';
    herzliyaUser = typeof body.herzliyaUser === 'string' ? body.herzliyaUser.trim() : '';
    herzliyaPass = typeof body.herzliyaPass === 'string' ? body.herzliyaPass.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (sessionCookie) { patch.sessionCookie = sessionCookie; patch.sessionCookieSavedAt = Date.now(); }
  if (herzliyaUser) patch.herzliyaUser = herzliyaUser;
  if (herzliyaPass) patch.herzliyaPass = herzliyaPass;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing_to_save' }, { status: 400 });

  await patchDocument(`user_calendar_sync/${authUser.uid}`, patch as Record<string, string>);

  return NextResponse.json({ ok: true });
}
