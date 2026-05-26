import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';

export const dynamic = 'force-dynamic';

// POST  — queue a sync request for the Oracle VM (polls Firestore every 5 min)
// DELETE — reset a stuck 'running' status so the button unlocks
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

  // Also reset any stuck 'running' job status so the card unlocks immediately
  await patchDocument('adminMetrics/job-ratings-midrug-scrape', {
    lastStatus: 'pending',
    lastMessage: 'בקשה נשלחה — Oracle VM יסנכרן בקרוב',
    lastError: null,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, never>);

  return NextResponse.json({
    success: true,
    queued: true,
    message: 'בקשה נשלחה — Oracle VM יסנכרן תוך ~5 דקות',
  });
}

export async function DELETE(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  await patchDocument('adminMetrics/job-ratings-midrug-scrape', {
    lastStatus: null,
    lastMessage: 'אופס — הסטטוס אופס ידנית',
    lastError: null,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, never>);

  return NextResponse.json({ success: true, reset: true });
}
