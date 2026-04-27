import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { assertIsAdmin } from '@/lib/server/contactsSync';

function isAllowlistedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_BOOTSTRAP_EMAIL_ALLOWLIST || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export async function requireAdminRequest(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  // Primary: Firestore siteRole check
  try {
    await assertIsAdmin(authUser.uid);
    return authUser;
  } catch {
    // Fallback: email allowlist (env-controlled, cannot be spoofed by users)
    if (isAllowlistedAdmin(authUser.email)) {
      return authUser;
    }
    return NextResponse.json({ error: 'גישה למנהל בלבד' }, { status: 403 });
  }
}
