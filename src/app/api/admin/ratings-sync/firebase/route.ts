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

  // Fire the Firebase function — don't wait for completion (takes 30-60s).
  // The function writes status to Firestore directly; the admin UI reads that in real time.
  const firePromise = fetch(`${functionUrl}?forceWeekly=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceWeekly: true }),
  });

  // Wait up to 5s to catch immediate failures (bad URL, auth error, etc.)
  const earlyResult = await Promise.race([
    firePromise.then((r) => ({ ok: r.ok, status: r.status })).catch((e: Error) => ({ ok: false, status: 0, error: e.message })),
    new Promise<{ ok: true; status: 202 }>((resolve) => setTimeout(() => resolve({ ok: true, status: 202 }), 5000)),
  ]);

  if (!earlyResult.ok && earlyResult.status !== 0) {
    return NextResponse.json(
      { success: false, error: `HTTP ${earlyResult.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, started: true });
}
