// Phase 2: batch-enriches industry_master entries with Wikipedia infobox data.
// Processes BATCH_SIZE entries per call. The admin page loops until remaining === 0.
// wikiUrl 'none' sentinel = tried Wikipedia, page not found → skip on re-runs.
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
  // Skip entries that already have network data or were already attempted (wikiUrl === 'none')
  const needsWiki = allEntries.filter((e) => !e.network && e.wikiUrl !== 'none');
  const pending = needsWiki.slice(0, BATCH_SIZE);
  const totalPending = needsWiki.length;

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, enriched: 0, remaining: 0 });
  }

  let enriched = 0;
  for (const entry of pending) {
    const info = await fetchWikiInfobox(entry.showName);
    const update: Partial<IndustryMasterEntry> = {
      wikiUrl: info.wikiUrl || 'none',
      lastUpdated: new Date().toISOString(),
    };
    if (info.network) update.network = info.network;
    if (info.genre) update.genre = info.genre;
    if (info.logoUrl && !entry.logoUrl) update.logoUrl = info.logoUrl;
    await patchDocument(`industry_master/${entry.id}`, update as Record<string, unknown>);
    if (info.network || info.logoUrl) enriched++;
  }

  return NextResponse.json({
    processed: pending.length,
    enriched,
    remaining: Math.max(0, totalPending - pending.length),
  });
}
