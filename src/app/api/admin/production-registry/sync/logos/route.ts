import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 5;

async function fetchWikipediaLogo(name: string): Promise<string> {
  try {
    const url = new URL('https://he.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', `${name} תוכנית טלוויזיה`);
    url.searchParams.set('gsrlimit', '3');
    url.searchParams.set('prop', 'pageimages');
    url.searchParams.set('pithumbsize', '300');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TVIndustryIL/2.2.8 (logo sync)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
    const pages = Object.values(data.query?.pages ?? {});
    for (const page of pages) {
      if (page?.thumbnail?.source) return page.thumbnail.source;
    }
    return '';
  } catch {
    return '';
  }
}

async function fetchDuckDuckGoLogo(name: string): Promise<string> {
  try {
    const query = encodeURIComponent(`לוגו ${name} תוכנית`);
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      {
        headers: { 'User-Agent': 'TVIndustryIL/2.2.8 (logo sync)' },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return '';
    const data = await res.json() as { Image?: string; RelatedTopics?: { Icon?: { URL?: string } }[] };
    if (data.Image && data.Image.startsWith('http')) return data.Image;
    const iconUrl = data.RelatedTopics?.[0]?.Icon?.URL;
    if (iconUrl && iconUrl.startsWith('http')) return iconUrl;
    return '';
  } catch {
    return '';
  }
}

async function fetchLogoUrl(name: string): Promise<string> {
  const wiki = await fetchWikipediaLogo(name);
  if (wiki) { console.log(`[logos] Wikipedia: "${name}" → ${wiki}`); return wiki; }
  const ddg = await fetchDuckDuckGoLogo(name);
  if (ddg) { console.log(`[logos] DuckDuckGo: "${name}" → ${ddg}`); return ddg; }
  console.log(`[logos] No logo found for "${name}"`);
  return '';
}

// Phase 2: fetch logos for up to BATCH_SIZE entries that have no logoUrl yet
export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const allEntries = await listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []);
  // 'none' sentinel = already attempted, no logo found → skip
  const needsLogo = (e: ProductionRegistryEntry) => !e.logoUrl || e.logoUrl === '';
  const pending = allEntries.filter(needsLogo).slice(0, BATCH_SIZE);
  const totalPending = allEntries.filter(needsLogo).length;

  console.log(`[logos] pending=${totalPending} processing=${pending.length}`);

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, found: 0, remaining: 0 });
  }

  let found = 0;
  for (const entry of pending) {
    const logoUrl = await fetchLogoUrl(entry.name);
    // Always patch — even with empty string — so this entry won't be re-queued forever.
    // We mark it "attempted" by setting logoUrl to '' only if nothing was found,
    // so re-runs skip it. To re-try, delete the entry and re-sync.
    try {
      // Store 'none' as sentinel for "tried, no logo" so this entry is not re-queued
      await patchDocument(`production-registry/${entry.id}`, { logoUrl: logoUrl || 'none' });
      if (logoUrl) found++;
    } catch (err) {
      console.error(`[logos] patch failed for "${entry.name}":`, err);
    }
  }

  return NextResponse.json({
    processed: pending.length,
    found,
    remaining: Math.max(0, totalPending - pending.length),
  });
}
