/**
 * Production name normalization — strips known operational suffixes so that
 * "ארץ נהדרת - טסטים" and "ארץ נהדרת" are treated as the same production.
 *
 * Used in:
 *  • industry_master sync (deduplication before write)
 *  • pro-card-history masterMap lookup (so credits resolve to canonical entry)
 *  • wiki sync (search Wikipedia by clean canonical name)
 */

const SUFFIX_PATTERNS: RegExp[] = [
  / - טסטים$/i,
  / - הקמה$/i,
  / - חזרות$/i,
  / - יום צילום$/i,
  / - \(?\d+ תכניות\)?$/i,
  / - מוקלט$/i,
  / - בשידור חי$/i,
  / - שידור חי$/i,
  / - פיילוט$/i,
  / - אולפן$/i,
  / - לייב$/i,
  / - live$/i,
  / - pilot$/i,
];

/** Strip known operational suffixes from a production title */
export function stripProductionSuffixes(name: string): string {
  let result = name.trim();
  for (const pattern of SUFFIX_PATTERNS) {
    result = result.replace(pattern, '').trim();
  }
  return result;
}

/**
 * Quality-check: returns true if the title looks like noise or a person's name
 * rather than a real production title.
 *
 * Rules:
 *  1. Single Hebrew/Latin word (no spaces) — likely a person's first name or single noun
 *  2. Contains known status-noise keywords
 */
const NOISE_KEYWORDS = ['בוטל', 'שימו לב', 'עקב'];

export function isNoisyProductionTitle(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;

  // Rule 1: single word — very likely a first name or irrelevant entry
  if (!/\s/.test(trimmed)) return true;

  // Rule 2: contains noise keywords
  if (NOISE_KEYWORDS.some((kw) => trimmed.includes(kw))) return true;

  return false;
}

/**
 * Levenshtein-based string similarity in [0, 1].
 * Used to verify Wikipedia title relevance.
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const len1 = s1.length;
  const len2 = s2.length;
  const dp: number[][] = Array.from({ length: len1 + 1 }, (_, i) =>
    Array.from({ length: len2 + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      dp[i][j] =
        s1[i - 1] === s2[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const distance = dp[len1][len2];
  return 1 - distance / Math.max(len1, len2);
}
