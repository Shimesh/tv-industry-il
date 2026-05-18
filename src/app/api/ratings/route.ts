import { NextRequest, NextResponse } from 'next/server';
import { getLatestRatingsDaily, getLatestRatingsWeekly } from '@/lib/server/ratings';
import type { RatingsMode } from '@/lib/ratingsTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const type = (request.nextUrl.searchParams.get('type') || 'all') as RatingsMode | 'all';

  try {
    if (type === 'daily') {
      return NextResponse.json({ success: true, type, daily: await getLatestRatingsDaily() });
    }
    if (type === 'weekly') {
      return NextResponse.json({ success: true, type, weekly: await getLatestRatingsWeekly() });
    }
    if (type !== 'all') {
      return NextResponse.json({ success: false, error: 'Invalid ratings type' }, { status: 400 });
    }

    const [daily, weekly] = await Promise.all([
      getLatestRatingsDaily(),
      getLatestRatingsWeekly(),
    ]);
    return NextResponse.json({ success: true, type, daily, weekly });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load ratings' },
      { status: 500 },
    );
  }
}

