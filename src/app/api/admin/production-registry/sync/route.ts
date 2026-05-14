import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { createDocument, listDocuments, runQuery } from '@/lib/server/firestoreAdminRest';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';
import type { GlobalProductionDoc } from '@/lib/globalProductions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type FlexibleDoc = Record<string, unknown>;

const TITLE_FIELDS = ['name', 'productionName', 'projectName', 'title', 'eventTitle', 'subject', 'description'] as const;

function extractName(doc: FlexibleDoc): string {
  for (const field of TITLE_FIELDS) {
    const val = doc[field];
    if (typeof val === 'string' && val.trim().length >= 2) return val.trim();
  }
  return '';
}

// Split by '+' or '/' with optional surrounding whitespace; strip edge punctuation
function splitTitle(raw: string): string[] {
  return raw
    .split(/\s*[+\/]\s*/)
    .map((p) => p.replace(/^[\s\-–—_|,;:]+|[\s\-–—_|,;:]+$/g, '').trim())
    .filter((p) => p.length >= 2);
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Wikipedia: generator=search does fuzzy text search — works even for inexact Hebrew names
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
      headers: { 'User-Agent': 'TVIndustryIL/2.2.7 (production registry sync)' },
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
        headers: { 'User-Agent': 'TVIndustryIL/2.2.7 (production registry sync)' },
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
  console.log(`[sync:logo] No logo found for "${name}"`);
  return '';
}

// Load personal productions via collection group query (all nested 'productions' subcollections)
async function loadPersonalProductions(): Promise<FlexibleDoc[]> {
  try {
    return await runQuery<FlexibleDoc>({
      from: [{ collectionId: 'productions', allDescendants: true }],
      limit: 2000,
    });
  } catch (err) {
    console.warn('[sync] collection group query failed (expected if no subcollections exist):', err);
    return [];
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  // Fetch all data sources in parallel
  const [globalProductions, personalProductions, registryEntries] = await Promise.all([
    listDocuments<GlobalProductionDoc>('global_productions').catch(() => []),
    loadPersonalProductions(),
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
  ]);

  console.log(`[sync] sources — global_productions=${globalProductions.length} personal_productions=${personalProductions.length} registry=${registryEntries.length}`);

  // Log sample documents so we can inspect their actual schema
  if (globalProductions.length > 0) {
    console.log('[sync] sample global_productions doc:', JSON.stringify(globalProductions[0], null, 2));
  }
  if (personalProductions.length > 0) {
    console.log('[sync] sample personal_productions doc:', JSON.stringify(personalProductions[0], null, 2));
  }

  const existingKeys = new Set(registryEntries.map((e) => normalizeKey(e.name)));

  // Extract titles from global_productions (canonical 'name' field)
  const globalTitles: string[] = [];
  for (const doc of globalProductions) {
    const raw = doc.name?.trim() ?? '';
    if (!raw) continue;
    const parts = splitTitle(raw);
    console.log(`[sync:global] raw="${raw}" → parts=${JSON.stringify(parts)}`);
    globalTitles.push(...parts);
  }

  // Extract titles from personal productions (broader field search)
  const personalTitles: string[] = [];
  for (const doc of personalProductions as FlexibleDoc[]) {
    const raw = extractName(doc);
    if (!raw) continue;
    const parts = splitTitle(raw);
    console.log(`[sync:personal] raw="${raw}" → parts=${JSON.stringify(parts)}`);
    personalTitles.push(...parts);
  }

  const allTitles = [...globalTitles, ...personalTitles];
  console.log(`[sync] total extracted=${allTitles.length} unique=${new Set(allTitles.map(normalizeKey)).size}`);

  // Deduplicate and filter out already-registered names
  const uniqueNewTitles = [...new Set(
    allTitles.map(normalizeKey).filter((k) => !existingKeys.has(k)),
  )].map((k) => allTitles.find((t) => normalizeKey(t) === k) ?? k);

  console.log(`[sync] new titles to add: ${uniqueNewTitles.length} — ${JSON.stringify(uniqueNewTitles)}`);

  if (uniqueNewTitles.length === 0) {
    return NextResponse.json({
      added: 0,
      failed: 0,
      skipped: registryEntries.length,
      names: [],
      scanned: { global_productions: globalProductions.length, personal_productions: personalProductions.length },
      searchedFields: TITLE_FIELDS,
    });
  }

  const results: { name: string; logoUrl: string; ok: boolean }[] = [];

  for (const name of uniqueNewTitles) {
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
  const logos = results.filter((r) => r.logoUrl).length;

  console.log(`[sync] done: added=${added} failed=${failed} logos=${logos}`);

  return NextResponse.json({
    added,
    failed,
    skipped: registryEntries.length,
    names: results.map((r) => r.name),
    logos,
    scanned: { global_productions: globalProductions.length, personal_productions: personalProductions.length },
    searchedFields: TITLE_FIELDS,
  });
}
