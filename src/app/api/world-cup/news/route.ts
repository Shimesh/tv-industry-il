import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google News RSS — globally accessible, no IP blocking, returns IL sources
const GOOGLE_NEWS_QUERIES = [
  'https://news.google.com/rss/search?q=%D7%9E%D7%95%D7%A0%D7%93%D7%99%D7%90%D7%9C+2026&hl=iw&gl=IL&ceid=IL:iw',
  'https://news.google.com/rss/search?q=world+cup+2026+%D7%9B%D7%93%D7%95%D7%A8%D7%92%D7%9C&hl=iw&gl=IL&ceid=IL:iw',
];

let cache: { items: unknown[]; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/<[^>]+>/g, '').trim();
}

function tagValue(block: string, name: string): string {
  const cdata = block.match(new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '';
}

function sourceName(block: string): string {
  // Google News wraps source in <source url="...">NAME</source>
  return block.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1]?.trim() ?? 'חדשות';
}

function extractMeta(html: string, prop: string): string | undefined {
  const pats = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m?.[1]) return decodeHtml(m[1]);
  }
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/2.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
  } catch {
    return undefined;
  }
}

async function parseGoogleNews(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/2.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, 12).map((block) => {
    const rawLink = decodeHtml(tagValue(block, 'link'));
    // Google News wraps real URL — extract from redirect or use as-is
    const realLink = rawLink.replace(/^https:\/\/news\.google\.com\/rss\/articles\/.*?url=([^&]+).*$/, (_, u) => decodeURIComponent(u));
    return {
      title: decodeHtml(tagValue(block, 'title')),
      link: realLink || rawLink,
      pubDate: decodeHtml(tagValue(block, 'pubDate')) || new Date().toISOString(),
      source: sourceName(block),
      description: decodeHtml(tagValue(block, 'description')).slice(0, 220),
      imageUrl: undefined as string | undefined,
      isSourceLogoFallback: false,
    };
  }).filter((i) => i.title.length > 4);
}

async function fetchAllWcNews() {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.items;

  const results = await Promise.allSettled(GOOGLE_NEWS_QUERIES.map(parseGoogleNews));
  const seen = new Set<string>();
  const raw = results
    .flatMap((r) => r.status === 'fulfilled' ? r.value : [])
    .filter((item) => {
      const key = item.title.slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 15);

  // Enrich with OG images (parallel, 5s timeout each)
  const enriched = await Promise.all(
    raw.map(async (item) => {
      const img = await fetchOgImage(item.link);
      return { ...item, imageUrl: img, isSourceLogoFallback: !img };
    })
  );

  if (enriched.length > 0) cache = { items: enriched, at: Date.now() };
  return enriched;
}

export async function GET() {
  try {
    const items = await fetchAllWcNews();
    return NextResponse.json({ success: true, items }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json({ success: false, items: [] }, { status: 500 });
  }
}
