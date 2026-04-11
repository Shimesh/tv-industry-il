import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAuth } from '../firebaseAdmin.js';

export interface AuthenticatedSocketUser {
  uid: string;
  email?: string | null;
  name?: string | null;
  photoURL?: string | null;
  claims: DecodedIdToken;
}

export function extractBearerToken(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : trimmed;
}

export async function verifyFirebaseSocketToken(token: string): Promise<AuthenticatedSocketUser> {
  const claims = await getFirebaseAuth().verifyIdToken(token, true);

  return {
    uid: claims.uid,
    email: claims.email ?? null,
    name: claims.name ?? null,
    photoURL: claims.picture ?? null,
    claims,
  };
}

