import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  await patchDocument('appConfig/global', {
    ratingsSyncRequested: true,
    ratingsSyncRequestedAt: new Date().toISOString(),
    ratingsSyncInProgress: false,
    ratingsSyncLastStatus: null,
    ratingsSyncLastError: null,
  } as unknown as Record<string, never>);

  return NextResponse.json({
    success: true,
    queued: true,
    message: 'בקשה נשלחה — Oracle VM יסנכרן תוך ~5 דקות',
  });
}
