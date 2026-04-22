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
  author?: string;
  category?: string;
}

let cachedNews: RssNewsItem[] = [];
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

const RSS_SOURCES = [
  { name: 'Ynet - חדשות', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', sourceUrl: 'https://www.ynet.co.il' },
  { name: 'Ynet - תקשורת', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', sourceUrl: 'https://www.ynet.co.il' },
  { name: 'Ynet - תרבות', url: 'https://www.ynet.co.il/Integration/StoryRss538.xml', sourceUrl: 'https://www.ynet.co.il' },
  { name: 'Walla - חדשות', url: 'https://rss.walla.co.il/feed/1', sourceUrl: 'https://www.walla.co.il' },
  { name: 'Walla - תרבות', url: 'https://rss.walla.co.il/feed/4', sourceUrl: 'https://www.walla.co.il' },
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

function parseRssItems(xml: string): { title: string; link: string; pubDate: string; description: string }[] {
  const items: { title: string; link: string; pubDate: string; description: string }[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title[^>]*>\s*(?:<!\[CDATA\[)([\s\S]*?)(?:\]\]>)\s*<\/title>/i)
      || block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/link>/i);
    const dateMatch = block.match(/<pubDate[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/pubDate>/i);
    const descMatch = block.match(/<description[^>]*>\s*(?:<!\[CDATA\[)([\s\S]*?)(?:\]\]>)\s*<\/description>/i)
      || block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

    const title = decodeHtmlEntities(titleMatch?.[1] || '');
    const link = (linkMatch?.[1] || '').trim();
    const pubDate = (dateMatch?.[1] || '').trim();
    const description = decodeHtmlEntities(descMatch?.[1] || '').slice(0, 200);

    if (title && title.length > 3) {
      items.push({ title, link, pubDate, description });
    }
  }

  return items;
}

async function fetchRssFeed(source: typeof RSS_SOURCES[number]): Promise<RssNewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`RSS fetch failed for ${source.name}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const parsedItems = parseRssItems(xml);

    return parsedItems.slice(0, 8).map((item) => ({
      title: item.title,
      link: item.link || source.sourceUrl,
      pubDate: item.pubDate || new Date().toISOString(),
      source: source.name,
      sourceUrl: source.sourceUrl,
      description: item.description,
    }));
  } catch (error) {
    console.log(`RSS error for ${source.name}:`, error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

async function fetchAllNews(): Promise<RssNewsItem[]> {
  const now = Date.now();
  if (cachedNews.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedNews;
  }

  const results = await Promise.allSettled(RSS_SOURCES.map((source) => fetchRssFeed(source)));
  const allNews: RssNewsItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allNews.push(...result.value);
    }
  }

  const seen = new Set<string>();
  const deduped = allNews.filter((item) => {
    const key = item.title.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => {
    try {
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    } catch {
      return 0;
    }
  });

  if (deduped.length > 0) {
    cachedNews = deduped;
    lastFetch = now;
  }

  return deduped.length > 0 ? deduped : cachedNews;
}

export async function GET() {
  try {
    const news = await fetchAllNews();
    await Promise.all([
      recordRouteMetric({ route: '/api/news', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'news-fetch',
        ok: true,
        message: 'משיכת החדשות הושלמה בהצלחה',
        detail: { count: news.length },
      }),
    ]);

    return NextResponse.json({
      success: true,
      count: news.length,
      lastUpdate: new Date(lastFetch).toISOString(),
      items: news,
    });
  } catch (error) {
    await Promise.all([
      recordRouteMetric({ route: '/api/news', ok: false, statusCode: 500, error }),
      recordJobMetric({
        job: 'news-fetch',
        ok: false,
        message: 'משיכת החדשות נכשלה',
        detail: error instanceof Error ? error.message : error,
      }),
    ]);
    return NextResponse.json({
      success: false,
      count: 0,
      items: cachedNews.length > 0 ? cachedNews : [],
      error: 'Failed to fetch news',
    }, { status: 500 });
  }
}
