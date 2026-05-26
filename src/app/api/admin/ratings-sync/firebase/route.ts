import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';

export const dynamic = 'force-dynamic';

const FIREBASE_FN_URL =
  process.env.FIREBASE_SCRAPE_RATINGS_URL ||
  'https://me-west1-tv-industry-il.cloudfunctions.net/scrapeRatings';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${FIREBASE_FN_URL}?forceWeekly=1`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.error || `Firebase function returned ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : 'Firebase function unreachable';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
