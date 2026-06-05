import { NextResponse } from 'next/server';
import type { WorldCupNewsItem } from '@/lib/world-cup/types';

export const runtime = 'nodejs';
export const revalidate = 300;

const RSS_SOURCES = [
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=64', sourceUrl: 'https://www.sport5.co.il' },
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=110', sourceUrl: 'https://www.sport5.co.il' },
  { name: 'ONE', url: 'https://www.one.co.il/cat/coop/xml/rss/newsfeed.aspx?id=1', sourceUrl: 'https://www.one.co.il' },
  { name: 'Mako', url: 'https://www.mako.co.il/rss/31750e52b3b2c110', sourceUrl: 'https://www.mako.co.il/sport' },
  { name: 'Ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', sourceUrl: 'https://www.ynet.co.il/sport' },
  { name: 'Walla', url: 'https://rss.walla.co.il/feed/25', sourceUrl: 'https://sports.walla.co.il' },
];

// Require at least one of these strong WC terms — "2026" alone is NOT enough
const WC_REQUIRED = ['מונדיאל', 'world cup', 'גביע העולם', 'גביע-העולם', 'fifa', 'מוקדמות'];
// Additional supporting terms (only count if combined with a required term OR another strong context)
const WC_CONTEXT = ['ארגנטינה', 'ברזיל', 'צרפת', 'גרמניה', 'ספרד', 'פורטוגל', 'אנגליה', 'מרוקו', 'יפן', 'ארה"ב', 'קנדה', 'מקסיקו'];

function isWorldCupArticle(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return WC_REQUIRED.some((kw) => text.includes(kw.toLowerCase()));
}

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

function wcThumbnail(title: string, source: string): string {
  // Truncate title for SVG
  const short = title.length > 60 ? title.slice(0, 57) + '...' : title;
  // Split into up to 3 lines of ~20 chars each for readability
  const words = short.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 22 && line) {
      lines.push(line.trim());
      line = w;
      if (lines.length === 2) { line += ' ' + words.slice(words.indexOf(w) + 1).join(' '); break; }
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line.trim());

  const lineEls = lines
    .slice(0, 3)
    .map((l, i) => `<text x="480" y="${260 + i * 44}" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="white">${l.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c))}</text>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#002046"/>
        <stop offset="100%" stop-color="#138a36"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#g)"/>
    <text x="480" y="140" text-anchor="middle" font-family="Arial,sans-serif" font-size="52" font-weight="900" fill="#D4AF37">🏆 מונדיאל 2026</text>
    ${lineEls}
    <text x="480" y="460" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="600" fill="rgba(255,255,255,.6)">${source}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function parseItems(xml: string, source: (typeof RSS_SOURCES)[number]): WorldCupNewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, 15).map((block) => {
    const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1];
    const media = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1] || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1];
    const link = decodeHtml(tag(block, 'link')) || source.sourceUrl;
    const title = decodeHtml(tag(block, 'title'));
    const description = decodeHtml(tag(block, 'description')).slice(0, 220);
    const realImage = enclosure || media || null;
    return {
      title,
      link,
      pubDate: decodeHtml(tag(block, 'pubDate')) || new Date().toISOString(),
      source: source.name,
      description,
      imageUrl: realImage ?? wcThumbnail(title, source.name),
      isSourceLogoFallback: !realImage,
    };
  }).filter((item) => item.title && isWorldCupArticle(item.title, item.description));
}

async function fetchSource(source: (typeof RSS_SOURCES)[number]) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/2.0; +https://tv-industry-il.vercel.app)',
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
  const seen = new Set<string>();
  const items = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((item) => {
      const key = item.title.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 20);

  return NextResponse.json({ success: true, items }, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}
