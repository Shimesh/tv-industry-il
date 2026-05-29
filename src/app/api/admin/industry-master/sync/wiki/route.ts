// Batch Wikipedia enrichment for industry_master entries.
// Processes BATCH_SIZE entries per call. The admin page loops until remaining === 0.
// wikiUrl 'none' sentinel = tried Wikipedia, page not found → skip on re-runs.
// Title Match Verification: sets wikiTitleMatch='needs_review' and withholds logo
// when the Wikipedia page title is <70% similar to the show name.
//
// Force mode uses a `since` ISO timestamp sent by the client at the start of the run.
// Entries updated at or after `since` were already processed in this run → skip them.
// This prevents the infinite loop that would otherwise occur because force mode
// has no other way to know which entries were already processed this session.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchWikiInfobox } from '@/lib/server/wikiInfobox';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({})) as { force?: boolean; since?: string };
  const force = body.force === true;
  // `since` is an ISO timestamp sent by the client when the force run began.
  // Entries updated at or after this timestamp were already processed → skip.
  const since = typeof body.since === 'string' && body.since ? body.since : null;

  const allEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

  const needsWiki = allEntries.filter((e) => {
    if (force) {
      // In force mode, skip only entries already processed in this batch run
      if (since && e.lastUpdated && e.lastUpdated >= since) return false;
      return true;
    }
    // Normal mode: skip entries that are done or not found
    if (e.wikiUrl === 'none') return false;
    if (e.isVerified && e.logoUrl && e.logoUrl !== 'none' && e.network) return false;
    return true;
  });

  const pending = needsWiki.slice(0, BATCH_SIZE);
  const totalPending = needsWiki.length;

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, enriched: 0, remaining: 0 });
  }

  let enriched = 0;
  let needsReview = 0;
  for (const entry of pending) {
    const searchName = entry.masterName ?? entry.showName;
    const info = await fetchWikiInfobox(searchName);
    const isVerified = info.wikiTitleMatch === 'ok';
    const update: Record<string, string | boolean> = {
      wikiUrl: info.wikiUrl || 'none',
      wikiTitleMatch: info.wikiTitleMatch,
      isVerified,
      lastUpdated: new Date().toISOString(),
    };
    if (info.network) update.network = info.network;
    if (info.genre) update.genre = info.genre;
    if (info.productionCompany) update.productionCompany = info.productionCompany;
    if (isVerified) {
      update.logoUrl = info.logoUrl;
    } else {
      update.logoUrl = '';
    }
    await patchDocument(`industry_master/${entry.id}`, update);
    if (info.network || info.logoUrl) enriched++;
    if (info.wikiTitleMatch === 'needs_review') needsReview++;
  }

  return NextResponse.json({
    processed: pending.length,
    enriched,
    needsReview,
    remaining: Math.max(0, totalPending - pending.length),
  });
}
