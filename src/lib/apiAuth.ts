import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify Firebase ID token via Google's tokeninfo endpoint.
 * This avoids needing firebase-admin SDK.
 */
export async function verifyAuthToken(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const user = data.users?.[0];
    if (!user?.localId) return null;

    return { uid: user.localId };
  } catch {
    return null;
  }
}

/** Standard 401 response */
export function unauthorizedResponse() {
  return NextResponse.json({ error: 'לא מורשה - נדרשת הזדהות' }, { status: 401 });
}
