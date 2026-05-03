import { NextResponse } from 'next/server';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  description: string;
  newsType: string;
  author?: string;
  category?: string;
  imageUrl?: string;
  videoUrl?: string;
  imageSource: 'rss' | 'og' | 'source-logo';
  isSourceLogoFallback: boolean;
}

let cachedNews: RssNewsItem[] = [];
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

type RssSource = {
  name: string;
  url: string;
  sourceUrl: string;
  newsType: 'אקטואליה' | 'ספורט' | 'תרבות' | 'כלכלה' | 'טכנולוגיה' | 'תקשורת' | 'כללי';
  highValueOnly?: boolean;
  filterLink?: (link: string) => boolean;
};

const RSS_SOURCES: RssSource[] = [
  { name: 'Ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', sourceUrl: 'https://www.ynet.co.il', newsType: 'אקטואליה' },
  { name: 'Ynet תקשורת', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', sourceUrl: 'https://www.ynet.co.il', newsType: 'תקשורת' },
  { name: 'Ynet תרבות', url: 'https://www.ynet.co.il/Integration/StoryRss538.xml', sourceUrl: 'https://www.ynet.co.il', newsType: 'תרבות' },
  { name: 'Ynet ספורט', url: 'https://www.ynet.co.il/Integration/StoryRss3.xml', sourceUrl: 'https://www.ynet.co.il/sport', newsType: 'ספורט', highValueOnly: true },
  { name: 'Ynet כלכלה', url: 'https://www.ynet.co.il/Integration/StoryRss6.xml', sourceUrl: 'https://www.ynet.co.il/economy', newsType: 'כלכלה', highValueOnly: true },
  { name: 'Walla', url: 'https://rss.walla.co.il/feed/1', sourceUrl: 'https://www.walla.co.il', newsType: 'אקטואליה' },
  { name: 'Walla תרבות', url: 'https://rss.walla.co.il/feed/4', sourceUrl: 'https://www.walla.co.il', newsType: 'תרבות' },
  { name: 'Walla ספורט', url: 'https://rss.walla.co.il/feed/3', sourceUrl: 'https://sports.walla.co.il', newsType: 'ספורט', highValueOnly: true },
  { name: 'Walla כלכלה', url: 'https://rss.walla.co.il/feed/2', sourceUrl: 'https://finance.walla.co.il', newsType: 'כלכלה', highValueOnly: true },
  {
    name: 'ICE',
    url: 'https://www.ice.co.il/rss/media',
    sourceUrl: 'https://www.ice.co.il/media',
    newsType: 'תקשורת',
    filterLink: (link) => /ice\.co\.il\/(media|tv|culture|advertising|finance)\//i.test(link),
  },
  {
    name: 'Scopt',
    url: 'https://scopt.co.il/feed/',
    sourceUrl: 'https://scopt.co.il',
    newsType: 'תקשורת',
  },
];

const HIGH_VALUE_KEYWORDS = [
  'רייטינג',
  'שידור',
  'שידורים',
  'זכויות שידור',
  'טלוויזיה',
  'ערוץ',
  'קשת',
  'רשת',
  'כאן',
  'ספורט 5',
  'סטרימינג',
  'מדיה',
  'פרסום',
  'רגולציה',
  'הפקה',
  'תוכן',
  'אולפן',
  'מונדיאל',
  'יורו',
  'ליגת האלופות',
  'יורוליג',
  'אולימפיאדה',
  'נטפליקס',
  'דיסני',
  'פרטנר',
  'סלקום',
  'yes',
  'hot',
];

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  ynet: { bg: '#d71920', fg: '#ffffff' },
  walla: { bg: '#6d28d9', fg: '#ffffff' },
  ice: { bg: '#0891b2', fg: '#ffffff' },
  scopt: { bg: '#059669', fg: '#ffffff' },
};

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

function normalizeUrl(url: string, baseUrl: string): string | undefined {
  const trimmed = decodeHtmlEntities(url).trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function parseRssItems(xml: string, source: RssSource): Array<Omit<RssNewsItem, 'imageSource' | 'isSourceLogoFallback'>> {
  const items: Array<Omit<RssNewsItem, 'imageSource' | 'isSourceLogoFallback'>> = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = decodeHtmlEntities(extractCdata(block, 'title'));
    const link = normalizeUrl(extractCdata(block, 'link'), source.sourceUrl) || source.sourceUrl;
    const pubDate = decodeHtmlEntities(extractCdata(block, 'pubDate')) || new Date().toISOString();
    const description = decodeHtmlEntities(extractCdata(block, 'description')).slice(0, 240);
    const enclosureMatch = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    const mediaMatch = block.match(/<media:content[^>]*url=["']([^"']+)["']/i) || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const imageUrl = normalizeUrl(enclosureMatch?.[1] || mediaMatch?.[1] || '', source.sourceUrl);

    if (!title || title.length < 4) continue;

    items.push({
      title,
      link,
      pubDate,
      source: source.name,
      sourceUrl: source.sourceUrl,
      description,
      newsType: source.newsType,
      category: source.newsType,
      imageUrl,
    });
  }

  return items;
}

function isHighValue(item: { title: string; description: string }, source: RssSource): boolean {
  if (!source.highValueOnly) return true;
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return HIGH_VALUE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function sourceKey(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes('ynet')) return 'ynet';
  if (lower.includes('walla')) return 'walla';
  if (lower.includes('ice')) return 'ice';
  if (lower.includes('scopt')) return 'scopt';
  return 'default';
}

function sourceLogoDataUrl(source: string): string {
  const key = sourceKey(source);
  const colors = SOURCE_COLORS[key] || { bg: '#111827', fg: '#ffffff' };
  const label = source.replace(/\s+(תקשורת|תרבות|ספורט|כלכלה)$/u, '').slice(0, 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${colors.bg}"/><circle cx="480" cy="210" r="88" fill="rgba(255,255,255,.16)"/><text x="480" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="${colors.fg}">${label}</text><text x="480" y="315" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="600" fill="rgba(255,255,255,.78)">מקור הידיעה</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return undefined;
}

async function enrichImage(item: Omit<RssNewsItem, 'imageSource' | 'isSourceLogoFallback'>): Promise<RssNewsItem> {
  if (item.imageUrl) {
    return {
      ...item,
      imageUrl: item.imageUrl,
      imageSource: 'rss',
      isSourceLogoFallback: false,
    };
  }

  try {
    const response = await fetch(item.link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/1.2.3; +https://tv-industry-il.vercel.app)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      const html = await response.text();
      const image = normalizeUrl(extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || '', item.link);
      const video = normalizeUrl(extractMeta(html, 'og:video') || extractMeta(html, 'twitter:player') || '', item.link);
      if (image) {
        return {
          ...item,
          imageUrl: image,
          videoUrl: video,
          imageSource: 'og',
          isSourceLogoFallback: false,
        };
      }
    }
  } catch {
    // Source-logo fallback below keeps cards visually complete without failing the news request.
  }

  return {
    ...item,
    imageUrl: sourceLogoDataUrl(item.source),
    imageSource: 'source-logo',
    isSourceLogoFallback: true,
  };
}

async function fetchRssFeed(source: RssSource): Promise<Array<Omit<RssNewsItem, 'imageSource' | 'isSourceLogoFallback'>>> {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/1.2.3; +https://tv-industry-il.vercel.app)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const xml = await res.text();
    if (!xml || xml.length < 50) return [];

    const parsedItems = parseRssItems(xml, source);
    const filtered = parsedItems
      .filter((item) => (source.filterLink ? source.filterLink(item.link) : true))
      .filter((item) => isHighValue(item, source));

    return filtered.slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchAllNews(): Promise<RssNewsItem[]> {
  const now = Date.now();
  if (cachedNews.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedNews;
  }

  const results = await Promise.allSettled(RSS_SOURCES.map((source) => fetchRssFeed(source)));
  const allNews = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  const seen = new Set<string>();
  const deduped = allNews.filter((item) => {
    const key = item.title.replace(/\s+/g, ' ').slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort purely by publication date — newest first, so the player always starts from the freshest item
  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const enriched = await Promise.all(deduped.slice(0, 40).map(enrichImage));

  if (enriched.length > 0) {
    cachedNews = enriched;
    lastFetch = now;
  }

  return enriched.length > 0 ? enriched : cachedNews;
}

export async function GET() {
  try {
    const news = await fetchAllNews();
    Promise.all([
      recordRouteMetric({ route: '/api/news', ok: true, statusCode: 200 }),
      recordJobMetric({ job: 'news-fetch', ok: true, message: 'משיכת החדשות הושלמה בהצלחה', detail: { count: news.length } }),
    ]).catch(() => {});

    return NextResponse.json({
      success: true,
      count: news.length,
      lastUpdate: new Date(lastFetch || Date.now()).toISOString(),
      items: news,
    });
  } catch (error) {
    Promise.all([
      recordRouteMetric({ route: '/api/news', ok: false, statusCode: 500, error }),
      recordJobMetric({ job: 'news-fetch', ok: false, message: 'משיכת החדשות נכשלה', detail: error instanceof Error ? error.message : error }),
    ]).catch(() => {});

    return NextResponse.json(
      {
        success: false,
        count: 0,
        items: cachedNews,
        error: 'Failed to fetch news',
      },
      { status: 500 },
    );
  }
}
