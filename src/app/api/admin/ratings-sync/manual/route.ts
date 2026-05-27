import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { enrichRows } from '@/lib/server/ratings';
import { deleteDocument, getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { RatingRow, RatingsDailyDocument, RatingsWeeklyDocument } from '@/lib/ratingsTypes';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

type SimpleRow = {
  rank: number;
  showName: string;
  channel: string;
  date: string;
  duration: number;
  ratingPercent: number;
};

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = await request.json() as {
    type: 'daily' | 'weekly';
    date?: string;
    weekId?: string;
    weekRange?: string;
    rows: SimpleRow[];
  };

  const { type, rows } = body;
  if (!type || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Missing type or rows' }, { status: 400 });
  }

  const masterEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);
  const enriched = enrichRows(rows as RatingRow[], masterEntries);
  const fetchedAt = new Date().toISOString();

  if (type === 'daily') {
    const date = body.date || rows.find(r => r.date)?.date || '';
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const existing = await getDocument<RatingsDailyDocument>(`ratings_daily/${date}`).catch(() => null);
    const hasTelegram = !!(existing?.telegramHouseholds?.length || existing?.telegramPrime?.length);

    const doc: Partial<RatingsDailyDocument> = {
      date,
      targetAudience: 'משקי בית בכלל האוכלוסייה',
      top20: enriched.rows,
      fetchedAt,
      sourceDate: date,
      source: hasTelegram ? 'both' : 'midrug',
    };
    await patchDocument(`ratings_daily/${date}`, doc as unknown as Record<string, never>);

    return NextResponse.json({
      success: true,
      type: 'daily',
      date,
      rows: enriched.rows.length,
      matched: enriched.matched,
      unmatched: enriched.unmatched,
      telegramPreserved: hasTelegram,
    });
  }

  if (type === 'weekly') {
    const rawId = body.weekId || 'manual';
    const weekId = rawId.replace('/', '-');
    const weekRange = body.weekRange || rawId;

    const weeklyDoc: RatingsWeeklyDocument = {
      weekId,
      weekRange,
      targetAudience: 'משקי בית בכלל האוכלוסייה',
      top25: enriched.rows,
      fetchedAt,
    };
    await patchDocument(`ratings_weekly/week-${weekId}`, weeklyDoc as unknown as Record<string, never>);

    return NextResponse.json({
      success: true,
      type: 'weekly',
      weekId,
      weekRange,
      rows: enriched.rows.length,
      matched: enriched.matched,
      unmatched: enriched.unmatched,
    });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}

// PATCH — rename a weekly document (fix bad weekId/weekRange)
export async function PATCH(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { oldWeekId, newWeekId, weekRange } = await request.json() as {
    oldWeekId: string;
    newWeekId: string;
    weekRange: string;
  };

  if (!oldWeekId || !newWeekId || !weekRange) {
    return NextResponse.json({ error: 'Missing oldWeekId / newWeekId / weekRange' }, { status: 400 });
  }

  const existing = await getDocument<RatingsWeeklyDocument>(`ratings_weekly/week-${oldWeekId}`);
  if (!existing) {
    return NextResponse.json({ error: `Document week-${oldWeekId} not found` }, { status: 404 });
  }

  const fixed: RatingsWeeklyDocument = {
    ...existing,
    weekId: newWeekId,
    weekRange,
    fetchedAt: new Date().toISOString(),
  };

  await patchDocument(`ratings_weekly/week-${newWeekId}`, fixed as unknown as Record<string, never>);
  await deleteDocument(`ratings_weekly/week-${oldWeekId}`);

  return NextResponse.json({ success: true, from: `week-${oldWeekId}`, to: `week-${newWeekId}`, weekRange, rows: existing.top25?.length ?? 0 });
}
