import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { createDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type FlexibleDoc = Record<string, unknown>;

// Split by '+' or '/' with optional surrounding whitespace, clean up each part
function splitTitle(raw: string): string[] {
  return raw
    .split(/\s*[+\/]\s*/)
    .map((p) => p.replace(/^[\s\-–—_|,;:]+|[\s\-–—_|,;:]+$/g, '').trim())
    .filter((p) => p.length >= 2);
}

function extractTitles(source: string, docs: FlexibleDoc[]): string[] {
  const titles: string[] = [];
  for (const doc of docs) {
    const raw = String(doc.productionName || doc.title || doc.name || doc.eventTitle || '').trim();
    if (!raw) continue;
    const parts = splitTitle(raw);
    console.log(`[sync:${source}] raw="${raw}" → parts=${JSON.stringify(parts)}`);
    titles.push(...parts);
  }
  return titles;
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Wikipedia: generator=search finds the right page even when title isn't exact
async function fetchWikipediaLogo(productionName: string): Promise<string> {
  try {
    const url = new URL('https://he.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', `${productionName} תוכנית טלוויזיה`);
    url.searchParams.set('gsrlimit', '3');
    url.searchParams.set('prop', 'pageimages');
    url.searchParams.set('pithumbsize', '300');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TVIndustryIL/2.2.6 (production registry sync)' },
      signal: AbortSignal.timeout(7000),
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

// DuckDuckGo Instant Answer: free, no auth, returns Image for known entities
async function fetchDuckDuckGoLogo(productionName: string): Promise<string> {
  try {
    const query = encodeURIComponent(`לוגו ${productionName} תוכנית`);
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      {
        headers: { 'User-Agent': 'TVIndustryIL/2.2.6 (production registry sync)' },
        signal: AbortSignal.timeout(7000),
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
  const wikiLogo = await fetchWikipediaLogo(name);
  if (wikiLogo) {
    console.log(`[sync:logo] Wikipedia hit for "${name}": ${wikiLogo}`);
    return wikiLogo;
  }
  const ddgLogo = await fetchDuckDuckGoLogo(name);
  if (ddgLogo) {
    console.log(`[sync:logo] DuckDuckGo hit for "${name}": ${ddgLogo}`);
    return ddgLogo;
  }
  console.log(`[sync:logo] No logo found for "${name}", saving without logo`);
  return '';
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [calendarDocs, workBoardDocs, registryEntries] = await Promise.all([
    listDocuments<FlexibleDoc>('calendar').catch(() => []),
    listDocuments<FlexibleDoc>('work-boards').catch(() => []),
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
  ]);

  console.log(`[sync] fetched calendar=${calendarDocs.length} work-boards=${workBoardDocs.length} registry=${registryEntries.length}`);

  const existingKeys = new Set(registryEntries.map((e) => normalizeKey(e.name)));

  const calendarTitles = extractTitles('calendar', calendarDocs);
  const workBoardTitles = extractTitles('work-boards', workBoardDocs);
  const allTitles = [...calendarTitles, ...workBoardTitles];

  console.log(`[sync] total extracted titles=${allTitles.length} unique=${new Set(allTitles.map(normalizeKey)).size}`);

  const uniqueNewTitles = [...new Set(
    allTitles
      .map(normalizeKey)
      .filter((k) => !existingKeys.has(k)),
  )].map((k) => {
    // Recover original casing from the first occurrence
    return allTitles.find((t) => normalizeKey(t) === k) ?? k;
  });

  console.log(`[sync] new titles to add: ${uniqueNewTitles.length} — ${JSON.stringify(uniqueNewTitles)}`);

  if (uniqueNewTitles.length === 0) {
    return NextResponse.json({ added: 0, failed: 0, skipped: registryEntries.length, names: [] });
  }

  const results: { name: string; logoUrl: string; ok: boolean }[] = [];

  for (const name of uniqueNewTitles) {
    // Always save to Firestore — even without a logo
    const logoUrl = await fetchLogoUrl(name);
    try {
      await createDocument('production-registry', {
        name,
        logoUrl,
        channel: '',
        description: '',
        isMajor: false,
      });
      results.push({ name, logoUrl, ok: true });
    } catch (err) {
      console.error(`[sync] Firestore write failed for "${name}":`, err);
      results.push({ name, logoUrl, ok: false });
    }
  }

  const added = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`[sync] done: added=${added} failed=${failed}`);

  return NextResponse.json({
    added,
    failed,
    skipped: registryEntries.length,
    names: results.map((r) => r.name),
    logos: results.filter((r) => r.logoUrl).length,
  });
}
