import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runMidrugRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = await request.json().catch(() => ({}));

  try {
    const result = await runMidrugRatingsJob({
      route: '/api/admin/ratings-sync/midrug',
      trigger: 'admin',
      forceWeekly: body?.forceWeekly !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, source: 'midrug', error: error instanceof Error ? error.message : 'Midrug sync failed' },
      { status: 500 },
    );
  }
}

