import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse, type VerifiedAuthUser } from '@/lib/apiAuth';

const FALLBACK_PRIMARY_ADMIN_UID = 'pVtM4KuNSSSexQ3W32UmImJHJID3';

export function getPrimaryAdminUid(): string {
  return process.env.PRIMARY_ADMIN_UID?.trim() || FALLBACK_PRIMARY_ADMIN_UID;
}

export function isPrimaryAdminUid(uid: string | null | undefined): boolean {
  return Boolean(uid && uid === getPrimaryAdminUid());
}

export async function requirePrimaryAdminRequest(
  request: NextRequest,
): Promise<VerifiedAuthUser | NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  if (!isPrimaryAdminUid(authUser.uid)) {
    return NextResponse.json({ error: 'גישה למנהל המערכת בלבד' }, { status: 403 });
  }

  return authUser;
}
