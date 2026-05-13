import { NextResponse } from 'next/server';
import type { WorldCupNewsItem } from '@/lib/world-cup/types';

export const runtime = 'nodejs';
export const revalidate = 300;

const RSS_SOURCES = [
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=64', sourceUrl: 'https://www.sport5.co.il' },
  { name: 'ONE', url: 'https://www.one.co.il/cat/coop/xml/rss/newsfeed.aspx?id=1', sourceUrl: 'https://www.one.co.il' },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', sourceUrl: 'https://www.bbc.com/sport/football' },
];

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block: string, name: string): string {
  const cdata = block.match(new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${name}>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
}

function sourceLogo(source: string) {
  const color = source === 'BBC Sport' ? '#b91c1c' : source === 'ONE' ? '#2563eb' : '#059669';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${color}"/><text x="480" y="285" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="800" fill="white">${source}</text><text x="480" y="350" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="600" fill="rgba(255,255,255,.75)">World Cup 2026</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function parseItems(xml: string, source: (typeof RSS_SOURCES)[number]): WorldCupNewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, 12).map((block) => {
    const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1];
    const media = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1] || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1];
    const link = decodeHtml(tag(block, 'link')) || source.sourceUrl;
    return {
      title: decodeHtml(tag(block, 'title')),
      link,
      pubDate: decodeHtml(tag(block, 'pubDate')) || new Date().toISOString(),
      source: source.name,
      description: decodeHtml(tag(block, 'description')).slice(0, 220),
      imageUrl: enclosure || media || sourceLogo(source.name),
      isSourceLogoFallback: !(enclosure || media),
    };
  }).filter((item) => item.title);
}

async function fetchSource(source: (typeof RSS_SOURCES)[number]) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'TVIndustryIL-WorldCup/2.1.3',
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return [];
    return parseItems(await response.text(), source);
  } catch {
    return [];
  }
}

export async function GET() {
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchSource));
  const items = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 30);

  return NextResponse.json({ success: true, items }, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}
