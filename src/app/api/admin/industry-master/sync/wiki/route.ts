// Batch Wikipedia enrichment for industry_master entries.
// Processes BATCH_SIZE entries per call. The admin page loops until remaining === 0.
// wikiUrl 'none' sentinel = tried Wikipedia, page not found → skip on re-runs.
// Title Match Verification: sets wikiTitleMatch='needs_review' and withholds logo
// when the Wikipedia page title is <70% similar to the show name.
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

  const allEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);
  // Process entries that:
  //  - haven't been attempted yet (no wikiUrl) — initial enrichment
  //  - were previously flagged as 'needs_review' — retry with improved search
  //  - have no logo yet — may have been enriched for metadata but logo was skipped
  // Skip entries that are already verified AND have a logo AND have metadata
  const needsWiki = allEntries.filter((e) => {
    if (e.wikiUrl === 'none') return false; // Already tried, page not found on Wikipedia
    if (e.isVerified && e.logoUrl && e.logoUrl !== 'none' && e.network) return false; // Fully enriched
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
    // Update logo:
    //   • Verified match + new logo found → always apply (may correct a previously wrong image)
    //   • 'needs_review' and entry had an unverified logo → clear it to prevent wrong images
    if (info.logoUrl && isVerified) {
      if (!entry.logoUrl || entry.logoUrl === 'none' || entry.wikiTitleMatch === 'needs_review') {
        update.logoUrl = info.logoUrl;
      }
    } else if (!isVerified && entry.logoUrl && entry.wikiTitleMatch === 'needs_review') {
      update.logoUrl = ''; // Previously unverified logo — clear it
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
