// Fetches Hebrew Wikipedia infobox fields for a TV show.
// Uses two distinct Wikipedia API calls:
//   1. action=query&list=search  → find the best-matching page title
//   2. action=parse&prop=wikitext → get raw infobox markup to extract fields
//   3. action=query&prop=pageimages → get logo thumbnail URL
// Title Match Verification: compares the Wikipedia page title to the requested show name.
// If similarity < 70%, the result is flagged as 'needs_review' and the logo is withheld.

import { stringSimilarity, stripProductionSuffixes } from '@/lib/productionNameNormalization';

const WIKI_BASE = 'https://he.wikipedia.org/w/api.php';
const UA = 'TVIndustryIL/2.4.5 (industry-master sync)';
const TITLE_MATCH_THRESHOLD = 0.70;

async function searchWikiPage(name: string): Promise<{ title: string; pageUrl: string } | null> {
  try {
    const url = new URL(WIKI_BASE);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', `${name} טלוויזיה`);
    url.searchParams.set('srlimit', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { query?: { search?: { title: string }[] } };
    const title = data.query?.search?.[0]?.title;
    if (!title) return null;
    return {
      title,
      pageUrl: `https://he.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

async function fetchWikiText(pageTitle: string): Promise<string> {
  try {
    const url = new URL(WIKI_BASE);
    url.searchParams.set('action', 'parse');
    url.searchParams.set('page', pageTitle);
    url.searchParams.set('prop', 'wikitext');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { parse?: { wikitext?: string } };
    return data.parse?.wikitext ?? '';
  } catch {
    return '';
  }
}

// Strips [[Link|Display]] → Display, [[Link]] → Link, and trims whitespace
function stripWikiMarkup(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'{2,3}/g, '')
    .trim();
}

function extractInfoboxField(wikitext: string, fieldName: string): string {
  const regex = new RegExp(`\\|\\s*${fieldName}\\s*=\\s*([^\\n|{}]+)`, 'i');
  const match = wikitext.match(regex);
  if (!match) return '';
  return stripWikiMarkup(match[1]);
}

async function fetchWikiLogoUrl(pageTitle: string): Promise<string> {
  try {
    const url = new URL(WIKI_BASE);
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', pageTitle);
    url.searchParams.set('prop', 'pageimages');
    url.searchParams.set('pithumbsize', '300');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
    const pages = Object.values(data.query?.pages ?? {});
    return pages[0]?.thumbnail?.source ?? '';
  } catch {
    return '';
  }
}

export type WikiInfoboxResult = {
  logoUrl: string;
  network: string;
  genre: string;
  productionCompany: string;
  wikiUrl: string;
  /** 'ok' = title matched ≥70%, 'needs_review' = weak match — logo withheld */
  wikiTitleMatch: 'ok' | 'needs_review' | '';
};

export async function fetchWikiInfobox(showName: string): Promise<WikiInfoboxResult> {
  const page = await searchWikiPage(showName);
  if (!page) return { logoUrl: '', network: '', genre: '', productionCompany: '', wikiUrl: '', wikiTitleMatch: '' };

  // --- Title Match Verification ---
  // Compare canonical (suffix-stripped) show name to the Wikipedia page title found.
  const canonicalName = stripProductionSuffixes(showName);
  const similarity = stringSimilarity(canonicalName, page.title);
  const titleMatches = similarity >= TITLE_MATCH_THRESHOLD;
  const wikiTitleMatch: 'ok' | 'needs_review' = titleMatches ? 'ok' : 'needs_review';

  const [wikitext, rawLogoUrl] = await Promise.all([
    fetchWikiText(page.title),
    // Only fetch logo if the title matched well enough
    titleMatches ? fetchWikiLogoUrl(page.title) : Promise.resolve(''),
  ]);

  const network = extractInfoboxField(wikitext, 'רשת שידור');
  // Hebrew Wikipedia uses several spellings for genre
  const genre =
    extractInfoboxField(wikitext, "ז'אנר") ||
    extractInfoboxField(wikitext, 'ז׳אנר') ||
    extractInfoboxField(wikitext, 'סוג');
  // Extract production company (multiple field name variants)
  const productionCompany =
    extractInfoboxField(wikitext, 'חברת הפקה') ||
    extractInfoboxField(wikitext, 'הפקה') ||
    extractInfoboxField(wikitext, 'מפיק') ||
    extractInfoboxField(wikitext, 'מפיקים');

  // Only use logo if title matched; otherwise leave blank so admin can fix manually
  const logoUrl = titleMatches ? rawLogoUrl : '';

  return { logoUrl, network, genre, productionCompany, wikiUrl: page.pageUrl, wikiTitleMatch };
}
