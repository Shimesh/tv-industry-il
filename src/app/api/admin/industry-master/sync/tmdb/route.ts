// Batch TMDB poster enrichment for industry_master entries.
// Only processes entries that have no logo yet (logoUrl === '' or missing).
// Force mode (force=true) re-processes all entries using the `since` anti-loop pattern.
//
// Requires TMDB_API_KEY environment variable.
// Get a free key at: https://www.themoviedb.org/settings/api
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchTmdbEnrich } from '@/lib/server/tmdbEnrich';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.TMDB_API_KEY ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB_API_KEY לא מוגדר — הוסף אותו ל-.env.local ו-Vercel' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { force?: boolean; since?: string };
  const force = body.force === true;
  const since = typeof body.since === 'string' && body.since ? body.since : null;

  const allEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

  const needsTmdb = allEntries.filter((e) => {
    if (force) {
      if (since && e.lastUpdated && e.lastUpdated >= since) return false;
      return true;
    }
    // Normal mode: only entries with no logo at all
    if (e.logoUrl && e.logoUrl !== '') return false;
    return true;
  });

  const pending = needsTmdb.slice(0, BATCH_SIZE);
  const totalPending = needsTmdb.length;

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, enriched: 0, remaining: 0 });
  }

  let enriched = 0;
  for (const entry of pending) {
    const searchName = entry.masterName ?? entry.showName;
    const result = await fetchTmdbEnrich(searchName, apiKey);
    const update: Record<string, string> = {
      lastUpdated: new Date().toISOString(),
    };
    if (result.logoUrl) {
      update.logoUrl = result.logoUrl;
      enriched++;
    }
    await patchDocument(`industry_master/${entry.id}`, update);
  }

  return NextResponse.json({
    processed: pending.length,
    enriched,
    remaining: Math.max(0, totalPending - pending.length),
  });
}
