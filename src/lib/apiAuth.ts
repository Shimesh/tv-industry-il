import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';

export type VerifiedAuthUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

/**
 * Verify Firebase ID token via Google's tokeninfo endpoint.
 * This avoids needing firebase-admin SDK.
 */
export async function verifyAuthToken(request: NextRequest): Promise<VerifiedAuthUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      displayName: typeof decoded.name === 'string' ? decoded.name : null,
      photoURL: typeof decoded.picture === 'string' ? decoded.picture : null,
    };
  } catch {
    // Fall back to Google Identity Toolkit only if Admin verification is unavailable.
  }

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

    return {
      uid: user.localId,
      email: typeof user.email === 'string' ? user.email : null,
      displayName: typeof user.displayName === 'string' ? user.displayName : null,
      photoURL: typeof user.photoUrl === 'string' ? user.photoUrl : null,
    };
  } catch {
    return null;
  }
}

/** Standard 401 response */
export function unauthorizedResponse() {
  return NextResponse.json({ error: 'לא מורשה - נדרשת הזדהות' }, { status: 401 });
}
