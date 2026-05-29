// Fetches TV show poster from The Movie Database (TMDB).
// TMDB has comprehensive Israeli TV content with high-quality poster images.
// Requires TMDB_API_KEY env var (free at https://www.themoviedb.org/settings/api).
//
// Search strategy:
//   1. Search TMDB in Hebrew (language=he-IL) — finds Israeli shows by Hebrew name
//   2. Also search without language restriction for shows with English/Latin names
//   3. Pick best title match using stringSimilarity (threshold 0.55 — lower than
//      Wikipedia's 0.70 because TMDB may store Hebrew names with slight variations)

import { stringSimilarity, stripProductionSuffixes } from '@/lib/productionNameNormalization';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w300';

interface TmdbResult {
  id: number;
  name: string;
  original_name: string;
  poster_path: string | null;
}

const TMDB_MATCH_THRESHOLD = 0.55;

async function searchTmdb(query: string, apiKey: string, language?: string): Promise<TmdbResult[]> {
  try {
    const url = new URL(`${TMDB_BASE}/search/tv`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('include_adult', 'false');
    if (language) url.searchParams.set('language', language);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TVIndustryIL/2.5.0 (tmdb-enrich)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: TmdbResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

export type TmdbEnrichResult = {
  logoUrl: string;
};

export async function fetchTmdbEnrich(showName: string, apiKey: string): Promise<TmdbEnrichResult> {
  const canonicalName = stripProductionSuffixes(showName);

  // Run Hebrew and default-language searches in parallel
  const [heResults, defaultResults] = await Promise.all([
    searchTmdb(canonicalName, apiKey, 'he-IL'),
    searchTmdb(canonicalName, apiKey),
  ]);

  // Deduplicate by id, Hebrew results preferred (may have Hebrew poster)
  const seen = new Set<number>();
  const candidates: TmdbResult[] = [];
  for (const r of [...heResults, ...defaultResults]) {
    if (!seen.has(r.id)) { seen.add(r.id); candidates.push(r); }
  }

  if (!candidates.length) return { logoUrl: '' };

  // Pick the candidate whose name best matches the show
  let best = candidates[0];
  let bestScore = Math.max(
    stringSimilarity(canonicalName, best.name),
    stringSimilarity(canonicalName, best.original_name),
  );
  for (const c of candidates.slice(1)) {
    const score = Math.max(
      stringSimilarity(canonicalName, c.name),
      stringSimilarity(canonicalName, c.original_name),
    );
    if (score > bestScore) { best = c; bestScore = score; }
  }

  if (bestScore < TMDB_MATCH_THRESHOLD) return { logoUrl: '' };
  if (!best.poster_path) return { logoUrl: '' };

  return { logoUrl: `${TMDB_IMG}${best.poster_path}` };
}
