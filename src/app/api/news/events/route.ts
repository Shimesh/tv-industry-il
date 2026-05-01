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

let cachedEvents: EventItem[] = [];
let lastFetch = 0;
const CACHE_TTL = 30 * 60 * 1000;

const EVENT_FEEDS = [
  { source: 'ICE', url: 'https://www.ice.co.il/rss/media', sourceUrl: 'https://www.ice.co.il/media' },
  { source: 'Scopt', url: 'https://scopt.co.il/feed/', sourceUrl: 'https://scopt.co.il' },
];

const EVENT_KEYWORDS = ['כנס', 'ועידה', 'פסטיבל', 'טקס', 'פרסי', 'השקה', 'אירוע', 'פאנל', 'סדנה', 'שוק הטלוויזיה'];

const FALLBACK_EVENTS: EventItem[] = [
  {
    id: 'academy-awards-2026',
    title: 'טקס פרסי האקדמיה לטלוויזיה',
    description: 'אירוע שנתי מרכזי לתעשיית הטלוויזיה בישראל, עם דגש על יוצרים, הפקות וגופי שידור.',
    date: '2026-05-10',
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
    date: '2026-06-15',
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
    date: '2026-07-08',
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
    .trim();
}

function extractCdata(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return plain?.[1] || '';
}

function parseFutureDate(text: string, fallbackBase: Date): string {
  const dateMatch = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : fallbackBase.getFullYear();
    const date = new Date(year, month - 1, day, 12);
    if (!Number.isNaN(date.getTime()) && date.getTime() > Date.now()) {
      return date.toISOString();
    }
  }

  const fallback = new Date(fallbackBase);
  fallback.setDate(fallback.getDate() + 30);
  return fallback.toISOString();
}

async function fetchFeedEvents(feed: (typeof EVENT_FEEDS)[number]): Promise<EventItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/1.2.3; +https://tv-industry-il.vercel.app)',
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
        const pubDate = new Date(decodeHtmlEntities(extractCdata(block, 'pubDate')) || Date.now());
        const text = `${title} ${description}`;

        if (!EVENT_KEYWORDS.some((keyword) => text.includes(keyword))) return null;

        return {
          id: `${feed.source}-${index}-${title.slice(0, 30)}`,
          title,
          description,
          date: parseFutureDate(text, pubDate),
          time: null,
          location: 'ישראל',
          category: title.includes('פרס') || title.includes('טקס') ? 'פרסים' : title.includes('פסטיבל') ? 'פסטיבל' : 'כנס',
          source: feed.source,
          sourceUrl: link,
        };
      })
      .filter((item): item is EventItem => Boolean(item));

    return parsed.filter((item) => Date.parse(item.date) > Date.now());
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
