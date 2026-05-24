import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runTelegramRatingsJob } from '@/lib/server/ratingsSyncJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = ['fra1', 'cdg1', 'iad1'];

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const result = await runTelegramRatingsJob({
      route: '/api/admin/ratings-sync/telegram',
      trigger: 'admin',
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, source: 'telegram', error: error instanceof Error ? error.message : 'Telegram sync failed' },
      { status: 500 },
    );
  }
}

