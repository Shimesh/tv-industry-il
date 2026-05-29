// Fetches Hebrew Wikipedia infobox fields for a TV show.
// API calls:
//   1. action=query&list=search  → fetch top-5 results for TWO queries, pick best title match
//   2. action=parse&prop=wikitext → get raw infobox markup
//   3. action=query&prop=imageinfo → resolve infobox | תמונה = filename → URL  (preferred)
//   4. action=query&prop=pageimages → fallback if no infobox image field found
//
// Why infobox image over pageimages:
//   pageimages returns the article's representative image, which for person/couple articles
//   may be an unrelated cast photo (e.g. searching "חיים ומעיין" finds their article, whose
//   representative image is a photo from "האח הגדול"). The infobox | תמונה = field is the
//   show's actual logo/poster and only exists in TV-show articles.
//
// Title Match Verification: if Wikipedia page title is <70% similar to the show name,
// result is flagged as 'needs_review' and the logo is withheld.

import { stringSimilarity, stripProductionSuffixes } from '@/lib/productionNameNormalization';

const WIKI_BASE = 'https://he.wikipedia.org/w/api.php';
const UA = 'TVIndustryIL/2.5.0 (industry-master sync)';
const TITLE_MATCH_THRESHOLD = 0.70;

async function runWikiSearch(query: string): Promise<{ title: string }[]> {
  try {
    const url = new URL(WIKI_BASE);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', query);
    url.searchParams.set('srlimit', '5');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { query?: { search?: { title: string }[] } };
    return data.query?.search ?? [];
  } catch {
    return [];
  }
}

// Search Wikipedia and pick the candidate whose title best matches the show name.
// Runs two queries (with/without "טלוויזיה" suffix) and picks the best result across both.
async function searchWikiPage(name: string): Promise<{ title: string; pageUrl: string } | null> {
  try {
    const [withTv, withoutTv] = await Promise.all([
      runWikiSearch(`${name} טלוויזיה`),
      runWikiSearch(name),
    ]);

    const seen = new Set<string>();
    const candidates = [...withTv, ...withoutTv].filter((c) => {
      if (seen.has(c.title)) return false;
      seen.add(c.title);
      return true;
    });

    if (!candidates.length) return null;

    // Pick the candidate whose title is most similar to the show name
    let best = candidates[0];
    let bestScore = stringSimilarity(name, best.title);
    for (const candidate of candidates.slice(1)) {
      const score = stringSimilarity(name, candidate.title);
      if (score > bestScore) { best = candidate; bestScore = score; }
    }

    return {
      title: best.title,
      pageUrl: `https://he.wikipedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g, '_'))}`,
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

// Detects articles that have a TV-show infobox template (not a person/couple article)
function isTVShowArticle(wikitext: string): boolean {
  return /\{\{\s*(?:טלוויזיה|תוכנית טלוויזיה|סדרת טלוויזיה|תוכנית ריאליטי|ריאליטי|infobox television|infobox tv)/i.test(wikitext);
}

// Detects articles that are about a person or couple rather than a TV show
function isPersonArticle(wikitext: string): boolean {
  return /\{\{\s*(?:אישיות|ביוגרפיה|infobox person|infobox biography|infobox sportsperson)/i.test(wikitext);
}

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

// Extract image filename from infobox | תמונה = ... (or | לוגו = ...) and resolve to thumbnail URL.
// This is the show's actual logo/poster, more reliable than pageimages for TV articles.
async function fetchInfoboxImageUrl(wikitext: string): Promise<string> {
  // Matches: | תמונה = Filename.jpg  /  | לוגו = [[File:Img.png]]  /  | image = Img.png
  // Handles optional newline between = and the filename (common in Hebrew Wikipedia infoboxes)
  const match = wikitext.match(
    /\|\s*(?:תמונה|לוגו|logo|image)\s*=\s*(?:\n\s*)?\[?\[?(?:קובץ:|File:)?([^\n|{}\]]+)/i,
  );
  const raw = match?.[1]?.trim();
  if (!raw) return '';
  const filename = raw.replace(/^(?:קובץ:|File:)/i, '').trim();
  if (!filename || filename.length < 3) return '';

  try {
    const url = new URL(WIKI_BASE);
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', `File:${filename}`);
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url');
    url.searchParams.set('iiurlwidth', '300');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const data = await res.json() as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ thumburl?: string }> }> };
    };
    const pages = Object.values(data.query?.pages ?? {});
    return pages[0]?.imageinfo?.[0]?.thumburl ?? '';
  } catch {
    return '';
  }
}

// Fallback: page's representative image via pageimages prop.
// Only used when the article has no infobox image field.
async function fetchWikiPageImage(pageTitle: string): Promise<string> {
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
    const data = await res.json() as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };
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
  if (!page) {
    return { logoUrl: '', network: '', genre: '', productionCompany: '', wikiUrl: '', wikiTitleMatch: '' };
  }

  // --- Title Match Verification ---
  const canonicalName = stripProductionSuffixes(showName);
  const similarity = stringSimilarity(canonicalName, page.title);
  const titleMatches = similarity >= TITLE_MATCH_THRESHOLD;

  const wikitext = await fetchWikiText(page.title);

  const isTV = isTVShowArticle(wikitext);
  const isPerson = isPersonArticle(wikitext);

  // Downgrade to needs_review if the article is clearly about a person, not a TV show —
  // prevents couple articles (e.g. "חיים ומעיין") from inheriting an unrelated show logo.
  const wikiTitleMatch: 'ok' | 'needs_review' = (titleMatches && !isPerson) ? 'ok' : 'needs_review';

  let logoUrl = '';
  if (wikiTitleMatch === 'ok') {
    // Try infobox logo/poster first (specific to the show)
    logoUrl = await fetchInfoboxImageUrl(wikitext);
    // Fall back to page's representative image.
    // Safe here: wikiTitleMatch='ok' already filtered out person/couple articles via isPerson check,
    // so pageimages can't return a cast photo from an unrelated show.
    if (!logoUrl) {
      logoUrl = await fetchWikiPageImage(page.title);
    }
  }

  const network = extractInfoboxField(wikitext, 'רשת שידור');
  const genre =
    extractInfoboxField(wikitext, "ז'אנר") ||
    extractInfoboxField(wikitext, 'ז׳אנר') ||
    extractInfoboxField(wikitext, 'סוג');
  const productionCompany =
    extractInfoboxField(wikitext, 'חברת הפקה') ||
    extractInfoboxField(wikitext, 'הפקה') ||
    extractInfoboxField(wikitext, 'מפיק') ||
    extractInfoboxField(wikitext, 'מפיקים');

  return { logoUrl, network, genre, productionCompany, wikiUrl: page.pageUrl, wikiTitleMatch };
}
