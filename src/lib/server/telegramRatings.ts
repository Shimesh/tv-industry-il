import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import type { RatingsDailyDocument, TelegramRatingRow } from '@/lib/ratingsTypes';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

const TARGET_AUDIENCE = 'משקי בית בכלל האוכלוסייה';
const DEFAULT_MESSAGE_LIMIT = 30;

type ParsedScoptRatings = {
  date: string;
  sourceDate: string;
  targetAudience: string;
  telegramHouseholds: TelegramRatingRow[];
  telegramPrime: TelegramRatingRow[];
  telegramFetchedAt: string;
  fallbackUsed: false;
};

export type TelegramRatingsResult = {
  daily: {
    date: string;
    sourceDate: string;
    fallbackUsed: false;
    rows: number;
    matched: number;
    unmatched: number;
  };
  source: 'telegram';
  sourceMessageId: string;
  skipped?: boolean;
  reason?: string;
};

type TelegramImportOptions = {
  expectedDate?: string;
  skipIfAlreadyImported?: boolean;
};

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeChannel(value: string): string {
  const cleaned = normalizeWhitespace(value).replace(/^[,-]\s*/, '').replace(/\s*[,-]$/, '');
  if (!cleaned) return '';
  if (/^(?:11|כאן|kan)$/i.test(cleaned)) return 'כאן';
  if (/^(?:12|קשת)$/i.test(cleaned)) return '12';
  if (/^(?:13|רשת)$/i.test(cleaned)) return '13';
  if (/^(?:14|עכשיו\s*14)$/i.test(cleaned)) return '14';
  if (/^i24$/i.test(cleaned)) return 'i24';
  return cleaned;
}

function parsePercent(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

function parseViewers(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  return match ? Number(match[1]) : 0;
}

function parseSourceDate(message: string, fallbackDate: Date): string {
  const match = message.match(/לתאריך\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/u);
  if (!match) return fallbackDate.toISOString().slice(0, 10);

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear.padStart(4, '0');
  return `${year}-${month}-${day}`;
}

function formatSourceDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function extractRankedSegments(section: string): Array<{ sourceRank: number; text: string }> {
  const matches = Array.from(section.matchAll(/#(\d+)\s+/g));
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || section.length : section.length;
    return {
      sourceRank: Number(match[1]),
      text: normalizeWhitespace(section.slice(start, end)),
    };
  });
}

function splitSections(message: string): { news: string; prime: string } {
  const compact = normalizeWhitespace(message);
  const newsStart = compact.indexOf('בחדשות');
  const primeStart = compact.indexOf('בפריים טיים');
  const endMarkers = [
    compact.indexOf('רייטינג יומי מבית'),
    compact.indexOf('לתאריך'),
  ].filter((index) => index >= 0);
  const end = endMarkers.length ? Math.min(...endMarkers) : compact.length;

  return {
    news: newsStart >= 0
      ? compact.slice(newsStart + 'בחדשות'.length, primeStart >= 0 ? primeStart : end)
      : '',
    prime: primeStart >= 0
      ? compact.slice(primeStart + 'בפריים טיים'.length, end)
      : '',
  };
}

function stripTrend(value: string): string {
  return value
    .replace(/[⬆⬇↗️↘️]+/gu, ' ')
    .replace(/\b(?:עלייה|ירידה)\b/gu, ' ')
    .trim();
}

function parseRankedItem(segment: { sourceRank: number; text: string }): TelegramRatingRow | null {
  const text = stripTrend(segment.text);
  const ratingPercent = parsePercent(text);
  if (!ratingPercent) return null;

  const viewers = parseViewers(text);
  const percentIndex = text.search(/\d+(?:\.\d+)?\s*%/);
  const beforePercent = normalizeWhitespace(text.slice(0, percentIndex).replace(/\d+(?:\.\d+)?k\b/gi, ''));
  const afterPercent = normalizeWhitespace(text.slice(percentIndex).replace(/^\d+(?:\.\d+)?\s*%\s*/, ''));

  let showName = '';
  let channel = '';

  const commaMatch = beforePercent.match(/^(.*?),\s*([^\s,]+)\s*-\s*$/u);
  const dashMatch = beforePercent.match(/^(.*?)\s*-\s*$/u);
  const trailingChannelMatch = beforePercent.match(/^(.*?)\s+(i24|11|12|13|14|55|כאן)\s*-\s*$/iu);
  const channelAfterPercentMatch = afterPercent.match(/-\s*(i24|11|12|13|14|55|כאן)\b/iu);

  if (commaMatch) {
    showName = commaMatch[1];
    channel = commaMatch[2];
  } else if (trailingChannelMatch) {
    showName = trailingChannelMatch[1];
    channel = trailingChannelMatch[2];
  } else if (channelAfterPercentMatch) {
    showName = beforePercent.replace(/\d+(?:\.\d+)?k\b/gi, '').replace(/\s*-\s*$/u, '');
    channel = channelAfterPercentMatch[1];
  } else if (dashMatch) {
    showName = dashMatch[1];
  } else {
    showName = beforePercent.replace(/\s*-\s*$/u, '');
  }

  showName = normalizeWhitespace(showName.replace(/\d+(?:\.\d+)?k\b/gi, ''));
  channel = normalizeChannel(channel);

  if (!showName) return null;

  return {
    rank: segment.sourceRank,
    showName,
    channel,
    viewers,
    ratingPercent,
  };
}

function parseSection(sectionText: string): TelegramRatingRow[] {
  return extractRankedSegments(sectionText)
    .map(parseRankedItem)
    .filter((row): row is TelegramRatingRow => Boolean(row))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function hasMidrugRows(document: RatingsDailyDocument | null): boolean {
  if (!document?.top20?.length || document.source === 'telegram') return false;
  return document.top20.some((row) => Boolean(row.date && row.channel && row.duration > 0));
}

export function parseScoptRatingsMessage(message: string, fallbackDate = new Date()): ParsedScoptRatings | null {
  const text = normalizeWhitespace(message);
  if (!text.includes('רייטינג') || !text.includes('Scopt')) return null;

  const date = parseSourceDate(text, fallbackDate);
  const sections = splitSections(text);
  const telegramHouseholds = parseSection(sections.news);
  const telegramPrime = parseSection(sections.prime);

  if (!telegramHouseholds.length && !telegramPrime.length) return null;

  return {
    date,
    sourceDate: formatSourceDate(date),
    targetAudience: TARGET_AUDIENCE,
    telegramHouseholds,
    telegramPrime,
    telegramFetchedAt: new Date().toISOString(),
    fallbackUsed: false,
  };
}

export function hasTelegramRatingsConfig(): boolean {
  return Boolean(
    process.env.TELEGRAM_API_ID &&
    process.env.TELEGRAM_API_HASH &&
    process.env.TELEGRAM_SESSION &&
    (process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_SCOPT_CHANNEL),
  );
}

export async function importLatestTelegramRatings(options: TelegramImportOptions = {}): Promise<TelegramRatingsResult> {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID || '', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const session = process.env.TELEGRAM_SESSION || '';
  const channel = process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_SCOPT_CHANNEL || '';
  const limit = Number.parseInt(process.env.TELEGRAM_LIMIT || String(DEFAULT_MESSAGE_LIMIT), 10);

  if (!apiId || !apiHash || !session || !channel) {
    throw new Error('Telegram ratings configuration is missing');
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
  });

  try {
    await client.connect();
    const entity = await client.getEntity(channel);
    const messages = await client.getMessages(entity, { limit: Number.isFinite(limit) ? limit : DEFAULT_MESSAGE_LIMIT });

    let parsed: ParsedScoptRatings | null = null;
    let sourceMessageId = '';

    for (const message of messages) {
      const candidate = parseScoptRatingsMessage(message.message || '', message.date ? new Date(message.date * 1000) : new Date());
      if (!candidate) continue;
      if (options.expectedDate && candidate.date !== options.expectedDate) continue;
      parsed = candidate;
      sourceMessageId = String(message.id || '');
      break;
    }

    if (!parsed) {
      throw new Error(options.expectedDate
        ? `No Scopt ratings message found for ${options.expectedDate} in the latest ${messages.length} Telegram messages`
        : `No Scopt ratings message found in the latest ${messages.length} Telegram messages`);
    }

    const existing = await getDocument<RatingsDailyDocument>(`ratings_daily/${parsed.date}`).catch(() => null);
    const existingMessageId = String((existing as { sourceMessageId?: string } | null)?.sourceMessageId || '');
    if (options.skipIfAlreadyImported && existingMessageId && existingMessageId === sourceMessageId) {
      const rows = (existing?.telegramHouseholds?.length || 0) + (existing?.telegramPrime?.length || 0);
      return {
        daily: {
          date: parsed.date,
          sourceDate: parsed.sourceDate,
          fallbackUsed: false,
          rows,
          matched: 0,
          unmatched: rows,
        },
        source: 'telegram',
        sourceMessageId,
        skipped: true,
        reason: 'already imported',
      };
    }

    const hasMidrug = hasMidrugRows(existing);
    const patch: Record<string, string | boolean | number | null | object[]> = {
      date: parsed.date,
      sourceDate: existing?.sourceDate || parsed.sourceDate,
      targetAudience: existing?.targetAudience || parsed.targetAudience,
      telegramHouseholds: parsed.telegramHouseholds,
      telegramPrime: parsed.telegramPrime,
      telegramFetchedAt: parsed.telegramFetchedAt,
      source: hasMidrug ? 'both' : 'telegram',
      sourceMessageId,
    };

    if (!existing?.fetchedAt) patch.fetchedAt = parsed.telegramFetchedAt;
    if (!hasMidrug) patch.top20 = [];
    if (existing?.fallbackUsed === undefined) patch.fallbackUsed = false;

    await patchDocument(`ratings_daily/${parsed.date}`, patch as never);

    return {
      daily: {
        date: parsed.date,
        sourceDate: parsed.sourceDate,
        fallbackUsed: false,
        rows: parsed.telegramHouseholds.length + parsed.telegramPrime.length,
        matched: 0,
        unmatched: parsed.telegramHouseholds.length + parsed.telegramPrime.length,
      },
      source: 'telegram',
      sourceMessageId,
    };
  } finally {
    await client.disconnect();
  }
}
