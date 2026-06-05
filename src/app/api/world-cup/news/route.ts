import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
const USER_AGENT = `Mozilla/5.0 (compatible; TVIndustryIL/2.0; +${APP_URL})`;

// Only sports-specific feeds — no general news
const SPORT_SOURCES = [
  { name: 'Ynet ספורט', url: 'https://www.ynet.co.il/Integration/StoryRss3.xml', sourceUrl: 'https://www.ynet.co.il/sport' },
  { name: 'Walla ספורט', url: 'https://rss.walla.co.il/feed/3', sourceUrl: 'https://sports.walla.co.il' },
];

// Must contain at least one STRONG WC term — no broad country/player names alone
const WC_REQUIRED = ['מונדיאל', 'world cup', 'גביע העולם', 'גביע-העולם', 'fifa', 'מוקדמות'];

function isWcRequired(text: string): boolean {
  return WC_REQUIRED.some((kw) => text.includes(kw.toLowerCase()));
}

let cache: { items: unknown[]; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/<[^>]+>/g, '').trim();
}

function extractCdata(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  return block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
}

function normalizeUrl(url: string, base: string): string | undefined {
  const trimmed = decodeHtml(url).trim();
  if (!trimmed) return undefined;
  try { return new URL(trimmed, base).toString(); } catch { return undefined; }
}

function isWcArticle(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return isWcRequired(text);
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

async function enrichImage(link: string): Promise<string | undefined> {
  try {
    const res = await fetch(link, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
  } catch { return undefined; }
}

async function fetchSource(source: typeof SPORT_SOURCES[0]) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/xml, */*' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
    return blocks.slice(0, 15).flatMap((block) => {
      const title = decodeHtml(extractCdata(block, 'title'));
      const description = decodeHtml(extractCdata(block, 'description')).slice(0, 240);
      if (!title || !isWcArticle(title, description)) return [];
      const link = normalizeUrl(extractCdata(block, 'link'), source.sourceUrl) ?? source.sourceUrl;
      const pubDate = decodeHtml(extractCdata(block, 'pubDate')) || new Date().toISOString();
      const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1];
      const media = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1]
        || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1];
      return [{ title, link, pubDate, source: source.name, description, rssImage: enclosure || media || null }];
    });
  } catch { return []; }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json({ success: true, items: cache.items },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } });
  }

  const results = await Promise.allSettled(SPORT_SOURCES.map(fetchSource));
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
    .slice(0, 20);

  // Enrich images — prefer RSS enclosure/media, fallback to OG scrape
  const items = await Promise.all(
    raw.map(async ({ rssImage, ...item }) => {
      const imageUrl = rssImage ?? await enrichImage(item.link);
      return { ...item, imageUrl, isSourceLogoFallback: !imageUrl };
    }),
  );

  if (items.length > 0) cache = { items, at: Date.now() };

  return NextResponse.json({ success: true, items },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } });
}
