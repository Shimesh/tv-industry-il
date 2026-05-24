import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runMidrugRatingsJob, runTelegramRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ratings sync failed';
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = await request.json().catch(() => ({}));
  const source = body?.source === 'telegram' ? 'telegram' : 'midrug';

  try {
    const result = source === 'telegram'
      ? await runTelegramRatingsJob({ route: '/api/admin/ratings-sync', trigger: 'admin' })
      : await runMidrugRatingsJob({
        route: '/api/admin/ratings-sync',
        trigger: 'admin',
        forceWeekly: body?.forceWeekly !== false,
      });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, source, error: errorMessage(error) },
      { status: 500 },
    );
  }
}

