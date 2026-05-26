import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
    || process.env.FIREBASE_PROJECT_ID?.trim()
    || '';
  if (!projectId) {
    return NextResponse.json({ success: false, error: 'FIREBASE_PROJECT_ID not configured' }, { status: 500 });
  }

  const functionUrl = process.env.FIREBASE_RATINGS_FUNCTION_URL?.trim()
    || `https://me-west1-${projectId}.cloudfunctions.net/scrapeRatings`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);

  try {
    const res = await fetch(`${functionUrl}?forceWeekly=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceWeekly: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data?.error || `HTTP ${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
