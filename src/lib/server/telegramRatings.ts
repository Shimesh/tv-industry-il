import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import type { RatingsDailyDocument } from '@/lib/ratingsTypes';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { enrichRows } from '@/lib/server/ratings';

const TARGET_AUDIENCE = 'משקי בית בכלל האוכלוסייה';
const DEFAULT_MESSAGE_LIMIT = 30;

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

function splitSections(message: string): Array<{ name: string; text: string }> {
  const compact = normalizeWhitespace(message);
  const newsStart = compact.indexOf('בחדשות');
  const primeStart = compact.indexOf('בפריים טיים');
  const endMarkers = [
    compact.indexOf('רייטינג יומי מבית'),
    compact.indexOf('לתאריך'),
  ].filter((index) => index >= 0);
  const end = endMarkers.length ? Math.min(...endMarkers) : compact.length;

  const sections: Array<{ name: string; text: string }> = [];
  if (newsStart >= 0) {
    sections.push({
      name: 'חדשות',
      text: compact.slice(newsStart + 'בחדשות'.length, primeStart >= 0 ? primeStart : end),
    });
  }
  if (primeStart >= 0) {
    sections.push({
      name: 'פריים טיים',
      text: compact.slice(primeStart + 'בפריים טיים'.length, end),
    });
  }
  if (!sections.length) sections.push({ name: 'כללי', text: compact.slice(0, end) });
  return sections;
}

function stripTrend(value: string): string {
  return value
    .replace(/[⬆⬇↔️]+/gu, ' ')
    .replace(/\b(?:עלייה|ירידה)\b/gu, ' ')
    .trim();
}

function parseRankedItem(segment: { sourceRank: number; text: string }, date: string) {
  const text = stripTrend(segment.text);
  const ratingPercent = parsePercent(text);
  if (!ratingPercent) return null;

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
    rank: 0,
    showName,
    channel,
    date,
    duration: 0,
    ratingPercent,
    channelTags: [] as string[],
  };
}

export function parseScoptRatingsMessage(message: string, fallbackDate = new Date()): RatingsDailyDocument | null {
  const text = normalizeWhitespace(message);
  if (!text.includes('רייטינג') || !text.includes('Scopt')) return null;

  const date = parseSourceDate(text, fallbackDate);
  const rows: NonNullable<RatingsDailyDocument['top20']> = [];

  for (const section of splitSections(text)) {
    for (const segment of extractRankedSegments(section.text)) {
      const row = parseRankedItem(segment, date);
      if (row) {
        rows.push({
          ...row,
          channelTags: [section.name, row.channel].filter(Boolean),
        });
      }
    }
  }

  if (!rows.length) return null;

  return {
    date,
    sourceDate: formatSourceDate(date),
    targetAudience: TARGET_AUDIENCE,
    top20: rows.slice(0, 20).map((row, index) => ({ ...row, rank: index + 1 })),
    fetchedAt: new Date().toISOString(),
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

export async function importLatestTelegramRatings(): Promise<TelegramRatingsResult> {
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

    let parsed: RatingsDailyDocument | null = null;
    let sourceMessageId = '';

    for (const message of messages) {
      parsed = parseScoptRatingsMessage(message.message || '', message.date ? new Date(message.date * 1000) : new Date());
      if (parsed) {
        sourceMessageId = String(message.id || '');
        break;
      }
    }

    if (!parsed) {
      throw new Error(`No Scopt ratings message found in the latest ${messages.length} Telegram messages`);
    }

    const masterEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);
    const enriched = enrichRows(parsed.top20, masterEntries);
    const doc: RatingsDailyDocument & { sourceMessageId: string } = {
      ...parsed,
      top20: enriched.rows,
      source: 'telegram',
      sourceMessageId,
    };

    await patchDocument(`ratings_daily/${doc.date}`, doc as unknown as Record<string, never>);

    return {
      daily: {
        date: doc.date,
        sourceDate: doc.sourceDate || doc.date,
        fallbackUsed: false,
        rows: enriched.rows.length,
        matched: enriched.matched,
        unmatched: enriched.unmatched,
      },
      source: 'telegram',
      sourceMessageId,
    };
  } finally {
    await client.disconnect();
  }
}
