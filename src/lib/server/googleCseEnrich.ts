// Fetches show poster images via Google Custom Search Engine.
// Searches Israeli TV sites (Mako, Kan, Reshet, Now14) that are indexed by Google.
//
// Requires two env vars:
//   GOOGLE_CSE_KEY  — Google Cloud API key with "Custom Search JSON API" enabled
//   GOOGLE_CSE_ID   — Programmable Search Engine ID (cx value)
//
// Free tier: 100 queries/day.
// Setup: https://programmablesearchengine.google.com + console.cloud.google.com

import { stringSimilarity, stripProductionSuffixes } from '@/lib/productionNameNormalization';

const CSE_BASE = 'https://www.googleapis.com/customsearch/v1';

// Israeli TV sites to search
const SITE_RESTRICT = 'mako.co.il OR kan.org.il OR reshet.tv OR now14.co.il OR hot.net.il';

interface CseItem {
  title: string;
  link: string;
  pagemap?: {
    cse_image?: Array<{ src: string }>;
    cse_thumbnail?: Array<{ src: string }>;
    og?: Array<{ image?: string }>;
    metatags?: Array<{ 'og:image'?: string }>;
  };
}

async function searchCse(query: string, apiKey: string, cseId: string): Promise<CseItem[]> {
  try {
    const url = new URL(CSE_BASE);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cseId);
    url.searchParams.set('q', `${query} (${SITE_RESTRICT})`);
    url.searchParams.set('num', '5');
    url.searchParams.set('gl', 'il');
    url.searchParams.set('lr', 'lang_he');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TVIndustryIL/2.5.0 (cse-enrich)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { items?: CseItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

function extractImageFromItem(item: CseItem): string {
  // Priority: og:image meta tag → cse_image → cse_thumbnail
  const og = item.pagemap?.metatags?.[0]?.['og:image']
    ?? item.pagemap?.og?.[0]?.image;
  if (og && og.startsWith('http')) return og;

  const cseImg = item.pagemap?.cse_image?.[0]?.src;
  if (cseImg && cseImg.startsWith('http')) return cseImg;

  const thumb = item.pagemap?.cse_thumbnail?.[0]?.src;
  if (thumb && thumb.startsWith('http')) return thumb;

  return '';
}

export type CseEnrichResult = {
  logoUrl: string;
};

const CSE_SCORE_THRESHOLD = 0.45;

export async function fetchCseEnrich(
  showName: string,
  apiKey: string,
  cseId: string,
): Promise<CseEnrichResult> {
  const canonicalName = stripProductionSuffixes(showName);
  const items = await searchCse(canonicalName, apiKey, cseId);

  if (!items.length) return { logoUrl: '' };

  // Find the result whose page title best matches the show name
  let bestImg = '';
  let bestScore = 0;
  for (const item of items) {
    const titleScore = stringSimilarity(canonicalName, item.title);
    const img = extractImageFromItem(item);
    if (img && titleScore > bestScore) {
      bestScore = titleScore;
      bestImg = img;
    }
  }

  // Also accept the first result's image if score threshold met
  if (!bestImg && items[0]) {
    bestImg = extractImageFromItem(items[0]);
    bestScore = stringSimilarity(canonicalName, items[0].title);
  }

  if (bestScore < CSE_SCORE_THRESHOLD || !bestImg) return { logoUrl: '' };
  return { logoUrl: bestImg };
}
