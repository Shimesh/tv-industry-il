import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type UserFcm = { fcmTokens?: string[] };

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let token = '';
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === 'string' ? body.token.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const userDoc = await getDocument<UserFcm>(`users/${authUser.uid}`);
  const existing = Array.isArray(userDoc?.fcmTokens) ? userDoc.fcmTokens : [];

  if (!existing.includes(token)) {
    await patchDocument(`users/${authUser.uid}`, {
      fcmTokens: [...existing, token],
    });
  }

  return NextResponse.json({ success: true });
}
