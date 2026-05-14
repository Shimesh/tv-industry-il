import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { createDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type FlexibleDoc = Record<string, unknown>;

function extractTitles(docs: FlexibleDoc[]): string[] {
  const titles: string[] = [];
  for (const doc of docs) {
    const raw = String(doc.productionName || doc.title || doc.name || doc.eventTitle || '').trim();
    if (!raw) continue;
    // Split compound titles like "ארץ נהדרת + מאסטר שף"
    for (const part of raw.split('+')) {
      const trimmed = part.trim();
      if (trimmed.length >= 2) titles.push(trimmed);
    }
  }
  return titles;
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Fetch a thumbnail from Hebrew Wikipedia for an Israeli TV show
async function fetchWikipediaLogo(productionName: string): Promise<string> {
  try {
    const url = new URL('https://he.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'pageimages');
    url.searchParams.set('format', 'json');
    url.searchParams.set('pithumbsize', '300');
    url.searchParams.set('titles', productionName);
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TVIndustryIL/2.2.5 (production registry sync)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source ?? '';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [calendarDocs, workBoardDocs, registryEntries] = await Promise.all([
    listDocuments<FlexibleDoc>('calendar').catch(() => []),
    listDocuments<FlexibleDoc>('work-boards').catch(() => []),
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
  ]);

  // Build a set of already-registered names (normalized)
  const existingKeys = new Set(registryEntries.map((e) => normalizeKey(e.name)));

  // Extract and deduplicate candidate titles from calendar + work-boards
  const allTitles = extractTitles([...calendarDocs, ...workBoardDocs]);
  const uniqueNewTitles = [...new Set(
    allTitles.filter((t) => !existingKeys.has(normalizeKey(t))),
  )];

  if (uniqueNewTitles.length === 0) {
    return NextResponse.json({ added: 0, skipped: registryEntries.length, names: [] });
  }

  const results: { name: string; logoUrl: string; ok: boolean }[] = [];

  // Process sequentially to avoid hammering Wikipedia
  for (const name of uniqueNewTitles) {
    try {
      const logoUrl = await fetchWikipediaLogo(name);
      await createDocument('production-registry', {
        name,
        logoUrl,
        channel: '',
        description: '',
        isMajor: false,
      });
      results.push({ name, logoUrl, ok: true });
    } catch {
      results.push({ name, logoUrl: '', ok: false });
    }
  }

  const added = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    added,
    failed,
    skipped: registryEntries.length,
    names: results.map((r) => r.name),
  });
}
