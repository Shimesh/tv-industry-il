import { NextResponse } from 'next/server';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
const USER_AGENT = `Mozilla/5.0 (compatible; TVIndustryIL/1.8.8; +${APP_URL})`;

type EventKind = 'industry' | 'culture' | 'conference' | 'festival' | 'music';

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
  kind?: EventKind;
  importance?: number;
};

type EventSource = {
  source: string;
  url: string;
  sourceUrl: string;
  kind: EventKind;
  priority: number;
  categoryHints: string[];
  includeKeywords: string[];
};

type ParsedFutureDate = {
  iso: string;
  time: string | null;
};

let cachedEvents: EventItem[] = [];
let lastFetch = 0;
const CACHE_TTL = 30 * 60 * 1000;

const EVENT_SOURCES: EventSource[] = [
  {
    source: 'ICE',
    url: 'https://www.ice.co.il/rss/media',
    sourceUrl: 'https://www.ice.co.il/media',
    kind: 'industry',
    priority: 95,
    categoryHints: ['תקשורת', 'טלוויזיה', 'רדיו'],
    includeKeywords: ['כנס', 'ועידה', 'פאנל', 'טקס', 'פרסי', 'פסטיבל', 'השקה', 'תחרות', 'טלוויזיה', 'רדיו', 'תקשורת'],
  },
  {
    source: 'Scopt',
    url: 'https://scopt.co.il/feed/',
    sourceUrl: 'https://scopt.co.il',
    kind: 'industry',
    priority: 90,
    categoryHints: ['תקשורת', 'מדיה'],
    includeKeywords: ['כנס', 'ועידה', 'פאנל', 'סדנה', 'תקשורת', 'מדיה', 'רדיו', 'טלוויזיה', 'דיגיטל'],
  },
  {
    source: 'Mako טלוויזיה',
    url: 'https://rcs.mako.co.il/rss/57bce76404864110VgnVCM1000004801000aRCRD.xml',
    sourceUrl: 'https://www.mako.co.il/tv',
    kind: 'industry',
    priority: 82,
    categoryHints: ['טלוויזיה'],
    includeKeywords: ['טלוויזיה', 'קשת', 'השקה', 'אירוע', 'פאנל', 'טקס', 'פרסים', 'כנס', 'פסטיבל'],
  },
  {
    source: 'Mako תרבות',
    url: 'https://rcs.mako.co.il/rss/c7a987610879a310VgnVCM2000002a0c10acRCRD.xml',
    sourceUrl: 'https://www.mako.co.il/culture',
    kind: 'culture',
    priority: 68,
    categoryHints: ['תרבות'],
    includeKeywords: ['פסטיבל', 'טקס', 'פרסים', 'הקרנה', 'בכורה', 'אירוע', 'מופע ענק', 'הופעת ענק'],
  },
  {
    source: 'Mako TVBEE',
    url: 'https://rcs.mako.co.il/rss/makoTVNewest.xml',
    sourceUrl: 'https://www.mako.co.il/tvbee',
    kind: 'industry',
    priority: 78,
    categoryHints: ['טלוויזיה'],
    includeKeywords: ['טלוויזיה', 'סדרה', 'פסטיבל', 'טקס', 'פרסים', 'השקה', 'אירוע', 'כנס'],
  },
  {
    source: 'Mako מוזיקה',
    url: 'https://rcs.mako.co.il/rss/dea47c3250daf110VgnVCM100000290c10acRCRD.xml',
    sourceUrl: 'https://www.mako.co.il/music',
    kind: 'music',
    priority: 64,
    categoryHints: ['מוזיקה'],
    includeKeywords: ['פסטיבל', 'הופעת ענק', 'מופע ענק', 'פארק הירקון', 'אצטדיון', 'טקס', 'פרסים'],
  },
  {
    source: 'Globes שיווק ופרסום',
    url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=821',
    sourceUrl: 'https://www.globes.co.il',
    kind: 'conference',
    priority: 80,
    categoryHints: ['כנס', 'שיווק ופרסום'],
    includeKeywords: ['ועידת', 'כנס', 'פאנל', 'שיווק', 'פרסום', 'מדיה', 'תקשורת'],
  },
  {
    source: 'Globes תרבות',
    url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iid=3266',
    sourceUrl: 'https://www.globes.co.il',
    kind: 'culture',
    priority: 66,
    categoryHints: ['תרבות'],
    includeKeywords: ['פסטיבל', 'הקרנה', 'בכורה', 'טקס', 'פרסים', 'מופע ענק', 'הופעת ענק'],
  },
  {
    source: 'Walla תרבות',
    url: 'https://rss.walla.co.il/feed/4',
    sourceUrl: 'https://www.walla.co.il',
    kind: 'culture',
    priority: 62,
    categoryHints: ['תרבות'],
    includeKeywords: ['פסטיבל', 'טקס', 'פרסים', 'הקרנה', 'בכורה', 'אירוע', 'מופע ענק', 'הופעת ענק'],
  },
];

const EVENT_KEYWORDS = [
  'כנס',
  'ועידה',
  'ועידת',
  'פסטיבל',
  'טקס',
  'פרסי',
  'פרס',
  'הקרנה',
  'בכורה',
  'השקה',
  'אירוע',
  'פאנל',
  'סדנה',
  'קול קורא',
  'תחרות',
  'שוק הטלוויזיה',
  'טלוויזיה',
  'רדיו',
  'תקשורת',
  'מוזיקה',
  'הופעת ענק',
  'מופע ענק',
];

const LARGE_MUSIC_KEYWORDS = ['פסטיבל', 'הופעת ענק', 'מופע ענק', 'פארק הירקון', 'אצטדיון', 'אמפי', 'קיסריה', 'טקס', 'פרסים'];

const ARTICLE_ONLY_KEYWORDS = [
  'מנכ"ל',
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
  'ראיון',
  'ביקורת',
];

const FALLBACK_EVENTS: EventItem[] = [
  {
    id: 'docaviv-2026',
    title: 'פסטיבל דוקאביב',
    description: 'פסטיבל דוקומנטרי מרכזי ליוצרים, מפיקים, עורכים וגופי שידור, כולל הקרנות, מפגשי תעשייה ואירועי תוכן.',
    date: '2026-05-21T10:00:00+03:00',
    time: '10:00',
    location: 'תל אביב',
    category: 'פסטיבל',
    source: 'דוקאביב',
    sourceUrl: 'https://www.docaviv.co.il',
    kind: 'festival',
    importance: 92,
  },
  {
    id: 'jerusalem-film-festival-2026',
    title: 'פסטיבל הקולנוע ירושלים',
    description: 'אחד מאירועי הקולנוע והתוכן המרכזיים בישראל, עם הקרנות, מפגשי יוצרים, תחרויות ואירועי תעשייה.',
    date: '2026-07-16T10:00:00+03:00',
    time: '10:00',
    location: 'ירושלים',
    category: 'פסטיבל',
    source: 'פסטיבל הקולנוע ירושלים',
    sourceUrl: 'https://jff.org.il',
    kind: 'festival',
    importance: 88,
  },
  {
    id: 'israel-tv-academy-awards-2026',
    title: 'טקס פרסי האקדמיה לטלוויזיה',
    description: 'טקס פרסים שנתי מרכזי לתעשיית הטלוויזיה בישראל, עם דגש על יוצרים, הפקות, סדרות וגופי שידור.',
    date: '2026-09-10T20:00:00+03:00',
    time: '20:00',
    location: 'ישראל',
    category: 'פרסים',
    source: 'האקדמיה הישראלית לקולנוע וטלוויזיה',
    sourceUrl: 'https://www.israelfilmacademy.co.il',
    kind: 'industry',
    importance: 86,
  },
  {
    id: 'globes-mad-2026',
    title: 'ועידת MAD של גלובס',
    description: 'כנס מקצועי בתחומי שיווק, פרסום, מדיה ודיגיטל, רלוונטי לאנשי תקשורת, תוכן וגופי שידור.',
    date: '2026-10-20T09:00:00+03:00',
    time: '09:00',
    location: 'תל אביב',
    category: 'כנס',
    source: 'גלובס',
    sourceUrl: 'https://www.globes.co.il',
    kind: 'conference',
    importance: 78,
  },
  {
    id: 'israel-festival-2026',
    title: 'פסטיבל ישראל',
    description: 'אירוע תרבות גדול עם מופעים, מוזיקה, במה ותוכן אמנותי, רלוונטי למעקב אחר אירועי תוכן מרכזיים.',
    date: '2026-06-04T18:00:00+03:00',
    time: '18:00',
    location: 'ירושלים',
    category: 'פסטיבל',
    source: 'פסטיבל ישראל',
    sourceUrl: 'https://www.israel-festival.org',
    kind: 'culture',
    importance: 72,
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

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    return new URL(decodeHtmlEntities(url), baseUrl).toString();
  } catch {
    return baseUrl;
  }
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

function buildJerusalemIso(day: number, month: number, rawYear: number | null, time: string | null): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const now = new Date();
  let year = rawYear ?? now.getFullYear();
  let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time || '12:00'}:00+03:00`;
  let parsed = new Date(iso);

  if (!rawYear && parsed.getTime() <= now.getTime()) {
    year += 1;
    iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time || '12:00'}:00+03:00`;
    parsed = new Date(iso);
  }

  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) return null;
  return iso;
}

function parseExplicitFutureDate(text: string): ParsedFutureDate | null {
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;

  const numericDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (numericDate) {
    const year = numericDate[3] ? Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]) : null;
    const iso = buildJerusalemIso(Number(numericDate[1]), Number(numericDate[2]), year, time);
    if (iso) return { iso, time };
  }

  const hebrewDate = text.match(/\b(\d{1,2})\s+ב?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+(\d{4}))?\b/);
  if (hebrewDate) {
    const month = normalizeHebrewMonth(hebrewDate[2]);
    const year = hebrewDate[3] ? Number(hebrewDate[3]) : null;
    if (month) {
      const iso = buildJerusalemIso(Number(hebrewDate[1]), month, year, time);
      if (iso) return { iso, time };
    }
  }

  return null;
}

function includesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function isLikelyEvent(text: string, source: EventSource, futureDate: ParsedFutureDate | null): boolean {
  if (!futureDate) return false;
  if (!includesAny(text, EVENT_KEYWORDS) && !includesAny(text, source.includeKeywords)) return false;
  if (source.kind === 'music' && !includesAny(text, LARGE_MUSIC_KEYWORDS)) return false;
  return !includesAny(text, ARTICLE_ONLY_KEYWORDS);
}

function getCategory(text: string, source: EventSource): string {
  if (text.includes('פרס') || text.includes('טקס')) return 'פרסים';
  if (text.includes('פסטיבל')) return 'פסטיבל';
  if (text.includes('סדנה')) return 'סדנה';
  if (text.includes('הקרנה') || text.includes('בכורה')) return 'הקרנה';
  if (text.includes('מוזיקה') || text.includes('הופעת ענק') || text.includes('מופע ענק')) return 'מוזיקה';
  if (text.includes('כנס') || text.includes('ועידה') || text.includes('פאנל')) return 'כנס';
  return source.categoryHints[0] || 'אירוע';
}

function getLocation(text: string): string {
  if (text.includes('תל אביב') || text.includes('ת"א')) return 'תל אביב';
  if (text.includes('ירושלים')) return 'ירושלים';
  if (text.includes('חיפה')) return 'חיפה';
  if (text.includes('קיסריה')) return 'קיסריה';
  if (text.includes('פארק הירקון')) return 'פארק הירקון';
  if (text.includes('זום') || text.includes('אונליין') || text.includes('מקוון')) return 'אונליין';
  return 'ישראל';
}

function scoreEvent(text: string, source: EventSource): number {
  const eventKeywordScore = EVENT_KEYWORDS.filter((keyword) => text.includes(keyword)).length * 4;
  const sourceKeywordScore = source.includeKeywords.filter((keyword) => text.includes(keyword)).length * 3;
  const kindBonus = source.kind === 'industry' ? 18 : source.kind === 'conference' ? 14 : source.kind === 'festival' ? 10 : source.kind === 'music' ? 8 : 4;
  return source.priority + eventKeywordScore + sourceKeywordScore + kindBonus;
}

async function fetchFeedEvents(source: EventSource): Promise<EventItem[]> {
  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

    return itemBlocks
      .map((block, index): EventItem | null => {
        const title = decodeHtmlEntities(extractCdata(block, 'title'));
        const description = decodeHtmlEntities(extractCdata(block, 'description')).slice(0, 260);
        const link = normalizeUrl(extractCdata(block, 'link') || source.sourceUrl, source.sourceUrl);
        const text = `${title} ${description}`;
        const futureDate = parseExplicitFutureDate(text);

        if (!title || !isLikelyEvent(text, source, futureDate)) return null;

        return {
          id: `${source.source}-${index}-${title.slice(0, 36)}`,
          title,
          description,
          date: futureDate!.iso,
          time: futureDate!.time,
          location: getLocation(text),
          category: getCategory(text, source),
          source: source.source,
          sourceUrl: link,
          kind: source.kind,
          importance: scoreEvent(text, source),
        };
      })
      .filter((item): item is EventItem => Boolean(item));
  } catch {
    return [];
  }
}

async function loadEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedEvents;
  }

  const fetched = (await Promise.all(EVENT_SOURCES.map(fetchFeedEvents))).flat();
  const fallback = FALLBACK_EVENTS.filter((event) => Date.parse(event.date) > now);
  const combined = [...fetched, ...fallback]
    .filter((event, index, list) => list.findIndex((candidate) => candidate.title === event.title || candidate.sourceUrl === event.sourceUrl) === index)
    .sort((a, b) => {
      const dateDelta = Date.parse(a.date) - Date.parse(b.date);
      if (Math.abs(dateDelta) > 1000 * 60 * 60 * 24 * 10) return dateDelta;
      return (b.importance || 0) - (a.importance || 0);
    })
    .slice(0, 16);

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
