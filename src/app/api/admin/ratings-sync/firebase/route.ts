import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { runMidrugRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const result = await runMidrugRatingsJob({
      route: '/api/admin/ratings-sync/firebase',
      trigger: 'admin',
      forceWeekly: true,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Midrug sync failed' },
      { status: 500 },
    );
  }
}

// DELETE — reset a stuck 'running' Firestore status so the button unlocks
export async function DELETE(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  await patchDocument('adminMetrics/job-ratings-midrug-scrape', {
    lastStatus: null,
    lastMessage: 'סטטוס אופס ידנית',
    lastError: null,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, never>);

  return NextResponse.json({ success: true, reset: true });
}
