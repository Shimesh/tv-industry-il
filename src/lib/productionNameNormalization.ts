/**
 * Production name normalization — strips known operational suffixes so that
 * "ארץ נהדרת - טסטים" and "ארץ נהדרת" are treated as the same production.
 *
 * Used in:
 *  • industry_master sync (deduplication before write)
 *  • pro-card-history masterMap lookup (so credits resolve to canonical entry)
 *  • wiki sync (search Wikipedia by clean canonical name)
 *  • pro-card-history raw credit creation (collapseProductionName, before dedup)
 */

const SUFFIX_PATTERNS: RegExp[] = [
  // Operational suffixes with dash separator
  / - טסטים$/i,
  / - טסט$/i,
  / - בדיקה$/i,
  / - הקמה$/i,
  / - חזרות$/i,
  / - יום צילום$/i,
  / - \(?\d+ תכניות\)?$/i,
  / - מוקלט$/i,
  / - בשידור חי$/i,
  / - שידור חי$/i,
  / - שידור ישיר$/i,
  / - שידור מיוחד$/i,
  / - פיילוט$/i,
  / - אולפן$/i,
  / - לייב$/i,
  / - live$/i,
  / - pilot$/i,
  / - מיוחד$/i,
  / - גאלה$/i,
  / - בכורה$/i,
  / - סיום$/i,
  / - הסיום$/i,
  / - כתבות$/i,
  / - ריאיונות$/i,
  / - אורחים$/i,
  / - חלק [א-ת]'?$/i,
  // Same suffixes without leading space-dash (e.g. "האח הגדול פיילוט")
  / פיילוט$/i,
  / pilot$/i,
  // Cancellation / status annotations after dash
  / - בוטל.*$/i,
  / - ביטול.*$/i,
  / - נדחה.*$/i,
  // Audio/lighting check suffix, with or without space before dash
  / ?-+\s*בלאנס$/i,
  // Season / session / episode numbers — strip the number and everything after
  / עונה\s+\d+.*/i,
  / סשן\s+\d+.*/i,
  /\s+s\d+\b.*/i,
  // Episode/program number at end
  / תוכנית\s+\d+$/i,
  / פרק\s+\d+$/i,
];

/** Strip known operational suffixes from a production title (multi-pass until stable). */
export function stripProductionSuffixes(name: string): string {
  let result = name.trim();
  let prev = '';
  // Multi-pass: handles stacked suffixes like "... - פיילוט עונה 3"
  while (result !== prev) {
    prev = result;
    for (const pattern of SUFFIX_PATTERNS) {
      result = result.replace(pattern, '').trim();
    }
  }
  return result;
}

/**
 * Collapse "slot" production names that represent generic broadcast blocks
 * (not actual show titles) and strip season/session numbers.
 *
 * Examples:
 *  "רצועת ערב- גיא פינס"              → "רצועת ערב"
 *  "רצועת בוקר-- הקומה ה-12, גיא פינס" → "רצועת בוקר"
 *  "רצועת ערב- עידית הבריאות, גיא פינס" → "רצועת ערב"
 *  "זהו זה עונה 8 סשן 16"             → "זהו זה"  (via stripProductionSuffixes)
 *  "האח הגדול פיילוט"                  → "האח הגדול" (via stripProductionSuffixes)
 *
 * Applied to raw production names BEFORE deduplication so that multiple
 * appearances of "רצועת ערב - X" and "רצועת ערב - Y" collapse into one
 * merged entry with the correct shift count.
 */
export function collapseProductionName(name: string): string {
  const result = stripProductionSuffixes(name.trim());

  // Collapse "רצועת X..." → "רצועת X"
  // Match "רצועת" followed by one Hebrew word, then strip anything after it.
  // [א-ת]+ matches only Hebrew letters, stopping at dashes/digits/spaces.
  const stripMatch = result.match(/^(רצועת\s+[א-ת]+)/u);
  if (stripMatch) return stripMatch[1].trim();

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
const NOISE_KEYWORDS = [
  'בוטל', 'שימו לב', 'עקב',
  'ביטול', 'נדחה', 'אין שידור', 'לא מועבר', 'off air', 'off-air',
  'בוטל בגלל', 'עקב שביתה', 'עקב אבל',
];

export function isNoisyProductionTitle(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;

  // Contains noise keywords (status markers, cancellations, etc.)
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
