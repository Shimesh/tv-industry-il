import type { RatingRow, RatingsDailyDocument, TelegramRatingRow } from '@/lib/ratingsTypes';

export type UnifiedRatingSource = {
  name: 'Midrug' | 'Scopt';
  category?: string;
  ratingPercent: number;
  viewers?: number;
};

export type UnifiedRatingRow = RatingRow & {
  displayRank: number;
  category?: string;
  viewers?: number;
  sources: UnifiedRatingSource[];
};

function normalizeRatingName(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, '')
    .replace(/עונה\s*\d+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function ratingKeys(row: Pick<RatingRow, 'showName' | 'canonicalShowName'>): string[] {
  return Array.from(new Set([
    normalizeRatingName(row.showName),
    normalizeRatingName(row.canonicalShowName),
  ].filter(Boolean)));
}

function telegramShowName(row: TelegramRatingRow): string {
  const baseName = String(row.showName || '').trim();
  if (normalizeRatingName(baseName) === 'חדשות' && row.channel) return `${baseName} ${row.channel}`;
  return baseName;
}

function makeTelegramRow(row: TelegramRatingRow, category: string, date: string): UnifiedRatingRow {
  const showName = telegramShowName(row);
  return {
    rank: row.rank,
    displayRank: row.rank,
    showName,
    channel: row.channel || category,
    date,
    duration: 0,
    ratingPercent: row.ratingPercent,
    category,
    viewers: row.viewers,
    sources: [{
      name: 'Scopt',
      category,
      ratingPercent: row.ratingPercent,
      viewers: row.viewers,
    }],
  };
}

export function buildUnifiedDailyRatings(daily: RatingsDailyDocument | null | undefined): UnifiedRatingRow[] {
  if (!daily) return [];

  const unified = new Map<string, UnifiedRatingRow>();
  const midrugIndex = new Map<string, UnifiedRatingRow>();
  const targetDate = String(daily.date || '');

  for (const row of daily.top20 ?? []) {
    if (targetDate && row.date && row.date !== targetDate) continue;
    const keys = ratingKeys(row);
    const key = keys[0] || `midrug-${row.rank}-${row.showName}`;
    const item: UnifiedRatingRow = {
      ...row,
      displayRank: row.rank,
      sources: [{ name: 'Midrug', ratingPercent: row.ratingPercent }],
    };
    unified.set(key, item);
    keys.forEach((alias) => {
      unified.set(alias, item);
      midrugIndex.set(alias, item);
    });
  }

  const telegramRows = [
    ...((daily.telegramHouseholds ?? []).map((row) => ({ row, category: 'חדשות' }))),
    ...((daily.telegramPrime ?? []).map((row) => ({ row, category: 'פריים טיים' }))),
  ];

  for (const { row, category } of telegramRows) {
    const telegramKey = normalizeRatingName(telegramShowName(row));
    const match = midrugIndex.get(telegramKey);

    if (match) {
      match.sources = [
        ...match.sources.filter((source) => !(source.name === 'Scopt' && source.category === category)),
        {
          name: 'Scopt',
          category,
          ratingPercent: row.ratingPercent,
          viewers: row.viewers,
        },
      ];
      match.ratingPercent = Math.max(match.ratingPercent, row.ratingPercent);
      match.viewers ??= row.viewers;
      match.category = match.category ? match.category : category;
      if (!match.channel && row.channel) match.channel = row.channel;
      continue;
    }

    const item = makeTelegramRow(row, category, daily.date);
    unified.set(`scopt-${category}-${telegramKey || `${row.rank}-${row.showName}`}`, item);
  }

  return Array.from(new Set(unified.values()))
    .sort((a, b) => (b.ratingPercent || 0) - (a.ratingPercent || 0))
    .map((row, index) => ({ ...row, displayRank: index + 1 }));
}

export function sourceSummary(row: UnifiedRatingRow): string {
  const sources = Array.isArray(row.sources) ? row.sources : [];
  const scopt = sources.filter((source) => source.name === 'Scopt');
  const hasMidrug = sources.some((source) => source.name === 'Midrug');
  const labels = [
    hasMidrug ? 'מדרוג' : null,
    ...scopt.map((source) => source.category ? `Scopt ${source.category}` : 'Scopt'),
  ].filter(Boolean);
  return labels.join(' + ');
}
