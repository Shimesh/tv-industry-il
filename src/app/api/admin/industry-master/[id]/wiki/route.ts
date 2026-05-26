// Per-entry Wikipedia enrichment. Called by the "חפש בוויקיפדיה" button on each row.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchWikiInfobox } from '@/lib/server/wikiInfobox';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const entry = await getDocument<IndustryMasterEntry>(`industry_master/${id}`);
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

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
  // Admin explicitly re-ran the search — always apply the new result:
  //   • Verified match → use new logo (overwrites any previously wrong image)
  //   • No match (needs_review) → clear logo so wrong image is no longer shown
  if (isVerified) {
    update.logoUrl = info.logoUrl; // may be '' if infobox had no תמונה= field
  } else {
    update.logoUrl = ''; // clear potentially wrong logo
  }

  await patchDocument(`industry_master/${id}`, update);

  return NextResponse.json({
    id,
    network: (update.network ?? entry.network) as string,
    genre: (update.genre ?? entry.genre) as string,
    productionCompany: (update.productionCompany ?? entry.productionCompany) as string,
    logoUrl: (update.logoUrl ?? entry.logoUrl) as string,
    wikiUrl: update.wikiUrl as string,
    wikiTitleMatch: update.wikiTitleMatch as string,
    isVerified,
  });
}
