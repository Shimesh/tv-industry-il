import { NextResponse } from 'next/server';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EventItem = {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  location: string;
  source: string;
  sourceUrl: string;
  category: string;
  description: string;
};

type ParsedFutureDate = {
  iso: string;
  time: string | null;
};

let cachedEvents: EventItem[] = [];
let lastFetch = 0;
const CACHE_TTL = 30 * 60 * 1000;

const EVENT_FEEDS = [
  { source: 'ICE', url: 'https://www.ice.co.il/rss/media', sourceUrl: 'https://www.ice.co.il/media' },
  { source: 'Scopt', url: 'https://scopt.co.il/feed/', sourceUrl: 'https://scopt.co.il' },
];

const EVENT_KEYWORDS = ['כנס', 'ועידה', 'פסטיבל', 'טקס', 'פרסי', 'פרס', 'השקה', 'אירוע', 'פאנל', 'סדנה', 'שוק הטלוויזיה'];

const ARTICLE_ONLY_KEYWORDS = [
  'מנכ"ל',
  'מנכ״ל',
  'חברה',
  'רווח',
  'רווחים',
  'נפגע',
  'נפגעה',
  'טוען',
  'טוענת',
  'הודיעה',
  'דיווחה',
  'הכנסות',
  'מניה',
  'עסקה',
  'רכישה',
  'תביעה',
];

const FALLBACK_EVENTS: EventItem[] = [
  {
    id: 'academy-awards-2026',
    title: 'טקס פרסי האקדמיה לטלוויזיה',
    description: 'אירוע שנתי מרכזי לתעשיית הטלוויזיה בישראל, עם דגש על יוצרים, הפקות וגופי שידור.',
    date: '2026-05-10T20:00:00+03:00',
    time: '20:00',
    location: 'תל אביב',
    category: 'פרסים',
    source: 'האקדמיה לטלוויזיה',
    sourceUrl: 'https://www.israelfilmacademy.co.il',
  },
  {
    id: 'jerusalem-tv-festival-2026',
    title: 'פסטיבל הטלוויזיה הבינלאומי בירושלים',
    description: 'מפגש מקצועי לתוכן טלוויזיוני, פאנלים, הקרנות ונטוורקינג בין יוצרים, מפיקים וגופי שידור.',
    date: '2026-06-15T10:00:00+03:00',
    time: '10:00',
    location: 'ירושלים',
    category: 'פסטיבל',
    source: 'תעשיית הטלוויזיה',
    sourceUrl: 'https://www.ice.co.il/media',
  },
  {
    id: 'broadcast-tech-2026',
    title: 'כנס טכנולוגיות שידור והפקה',
    description: 'כנס מקצועי על AI בהפקה, שידור בענן, מערכות אולפן וכלי עבודה לעורכים ומפיקים.',
    date: '2026-07-08T09:30:00+03:00',
    time: '09:30',
    location: 'מרכז הארץ',
    category: 'כנס',
    source: 'Scopt',
    sourceUrl: 'https://scopt.co.il',
  },
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCdata(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return plain?.[1] || '';
}

function normalizeHebrewMonth(monthName: string): number | null {
  const normalized = monthName.replace(/^ב/, '').trim();
  const months: Record<string, number> = {
    ינואר: 1,
    פברואר: 2,
    מרץ: 3,
    אפריל: 4,
    מאי: 5,
    יוני: 6,
    יולי: 7,
    אוגוסט: 8,
    ספטמבר: 9,
    אוקטובר: 10,
    נובמבר: 11,
    דצמבר: 12,
  };
  return months[normalized] || null;
}

function buildJerusalemIso(day: number, month: number, year: number, time: string | null): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2026) return null;
  const timePart = time || '12:00';
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${timePart}:00+03:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return null;
  return iso;
}

function parseExplicitFutureDate(text: string): ParsedFutureDate | null {
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;

  const numericDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]);
    const currentYear = new Date().getFullYear();
    const year = numericDate[3] ? Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]) : currentYear;
    const iso = buildJerusalemIso(day, month, year, time);
    if (iso) return { iso, time };
  }

  const hebrewDate = text.match(/\b(\d{1,2})\s+ב?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+(\d{4}))?\b/);
  if (hebrewDate) {
    const day = Number(hebrewDate[1]);
    const month = normalizeHebrewMonth(hebrewDate[2]);
    const year = Number(hebrewDate[3] || new Date().getFullYear());
    if (month) {
      const iso = buildJerusalemIso(day, month, year, time);
      if (iso) return { iso, time };
    }
  }

  return null;
}

function isLikelyEvent(text: string, hasExplicitFutureDate: boolean): boolean {
  if (!hasExplicitFutureDate) return false;
  if (!EVENT_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  return !ARTICLE_ONLY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getCategory(title: string): string {
  if (title.includes('פרס') || title.includes('טקס')) return 'פרסים';
  if (title.includes('פסטיבל')) return 'פסטיבל';
  if (title.includes('סדנה')) return 'סדנה';
  if (title.includes('השקה')) return 'השקה';
  return 'כנס';
}

async function fetchFeedEvents(feed: (typeof EVENT_FEEDS)[number]): Promise<EventItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/1.2.4; +https://tv-industry-il.vercel.app)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

    const parsed = itemBlocks
      .map((block, index): EventItem | null => {
        const title = decodeHtmlEntities(extractCdata(block, 'title'));
        const description = decodeHtmlEntities(extractCdata(block, 'description')).slice(0, 220);
        const link = decodeHtmlEntities(extractCdata(block, 'link')) || feed.sourceUrl;
        const text = `${title} ${description}`;
        const futureDate = parseExplicitFutureDate(text);

        if (!title || !futureDate || !isLikelyEvent(text, true)) return null;

        return {
          id: `${feed.source}-${index}-${title.slice(0, 30)}`,
          title,
          description,
          date: futureDate.iso,
          time: futureDate.time,
          location: text.includes('תל אביב') ? 'תל אביב' : text.includes('ירושלים') ? 'ירושלים' : 'ישראל',
          category: getCategory(title),
          source: feed.source,
          sourceUrl: link,
        };
      })
      .filter((item): item is EventItem => Boolean(item));

    return parsed;
  } catch {
    return [];
  }
}

async function loadEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedEvents;
  }

  const fetched = (await Promise.all(EVENT_FEEDS.map(fetchFeedEvents))).flat();
  const fallback = FALLBACK_EVENTS.filter((event) => Date.parse(event.date) > now);
  const combined = [...fetched, ...fallback]
    .filter((event, index, list) => list.findIndex((candidate) => candidate.title === event.title) === index)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 12);

  cachedEvents = combined;
  lastFetch = now;
  return combined;
}

export async function GET() {
  try {
    const items = await loadEvents();
    recordRouteMetric({ route: '/api/news/events', ok: true, statusCode: 200 }).catch(() => {});
    return NextResponse.json({ success: true, count: items.length, lastUpdate: new Date(lastFetch).toISOString(), items });
  } catch (error) {
    recordRouteMetric({ route: '/api/news/events', ok: false, statusCode: 500, error }).catch(() => {});
    return NextResponse.json({ success: false, items: cachedEvents, error: 'Failed to fetch events' }, { status: 500 });
  }
}
