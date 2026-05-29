import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { clearGoogleCalendarTokens } from '@/lib/server/googleCalendarTokens';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    await clearGoogleCalendarTokens(authUser.uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 },
    );
  }
}
