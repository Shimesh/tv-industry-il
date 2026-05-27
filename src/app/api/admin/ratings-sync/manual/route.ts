import { NextRequest, NextResponse } from 'next/server';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import type { RatingRow, RatingsDailyDocument } from '@/lib/ratingsTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { date: string; rows: RatingRow[] };
  const { date, rows } = body;

  if (!date || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Missing date or rows' }, { status: 400 });
  }

  const doc: RatingsDailyDocument = {
    date,
    targetAudience: 'משקי בית בכלל האוכלוסייה',
    top20: rows,
    fetchedAt: new Date().toISOString(),
    sourceDate: date,
    source: 'midrug',
  };

  await patchDocument(`ratings_daily/${date}`, doc as unknown as Record<string, never>);

  return NextResponse.json({ success: true, date, rows: rows.length });
}
