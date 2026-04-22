import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { assertIsAdmin } from '@/lib/server/contactsSync';

export async function requireAdminRequest(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    await assertIsAdmin(authUser.uid);
    return authUser;
  } catch {
    return NextResponse.json({ error: 'גישה למנהל בלבד' }, { status: 403 });
  }
}
