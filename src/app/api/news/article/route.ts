import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const anthropic = new Anthropic();

const articleCache = new Map<string, {
  content: string; title: string; date: string; source: string;
  coverImageUrl?: string; smartSummary?: string;
  videoUrl?: string; fallbackGradient?: { from: string; to: string; label: string };
  fetchedAt: number;
}>();
const ARTICLE_CACHE_TTL = 30 * 60 * 1000;

const RATINGS_KEYWORDS = ['רייטינג', 'דירוג', 'צפייה', 'פופולריות', 'נתוני'];

function getSourceGradient(source: string, title: string): { from: string; to: string; label: string } {
  if (RATINGS_KEYWORDS.some(kw => title.includes(kw))) {
    return { from: '#b45309', to: '#78350f', label: '⭐ רייטינג' };
  }
  if (source.includes('ICE') || source.includes('ice')) return { from: '#0e7490', to: '#0f766e', label: 'ICE · מדיה ותקשורת' };
  if (source.includes('Scopt') || source.includes('scopt')) return { from: '#047857', to: '#065f46', label: 'Scopt · תקשורת' };
  if (source.includes('Ynet') || source.includes('ynet')) return { from: '#b91c1c', to: '#7f1d1d', label: 'Ynet' };
  if (source.includes('Walla') || source.includes('walla')) return { from: '#6d28d9', to: '#4c1d95', label: 'Walla' };
  return { from: '#e07a5f', to: '#5fb0a8', label: '' };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;/g, '')
    .replace(/&rlm;/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function extractArticleContent(html: string, url: string): {
  title: string; content: string; date: string; source: string;
  coverImageUrl?: string; videoUrl?: string; fallbackGradient?: { from: string; to: string; label: string };
} {
  let title = '';
  let content = '';
  let date = '';
  let source = '';
  let coverImageUrl: string | undefined;

  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:title["']/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  title = decodeHtmlEntities(
    ogTitleMatch?.[1] ||
    (h1Match?.[1] || '').replace(/<[^>]+>/g, '') ||
    titleTagMatch?.[1] ||
    ''
  );

  const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:site_name["']/i);
  source = decodeHtmlEntities(siteNameMatch?.[1] || '');
  if (!source) {
    try { source = new URL(url).hostname.replace('www.', ''); } catch { source = ''; }
  }

  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*name=["'](?:date|publish[_-]?date|pubdate)["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<time[^>]*datetime=["']([^"']*?)["']/i);
  date = dateMatch?.[1] || '';

  // Video extraction on raw HTML (before iframes are stripped by cleanHtml)
  const ogVideoMatch = html.match(/<meta[^>]*property=["']og:video(?::url)?["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:video(?::url)?["']/i);
  const youtubeMatch = html.match(/<iframe[^>]*src=["'][^"']*(?:youtube\.com\/embed|youtu\.be)\/([a-zA-Z0-9_-]{11})[^"']*["']/i);
  const vimeoMatch = html.match(/<iframe[^>]*src=["']([^"']*player\.vimeo\.com\/video\/\d+[^"']*)["']/i);
  const israeliPlayerMatch = html.match(/<iframe[^>]*src=["']([^"']*(?:mako\.co\.il|kan\.org\.il\/media|13tv\.co\.il)[^"']*)["']/i);

  const videoUrl = ogVideoMatch?.[1]
    || (youtubeMatch ? `https://www.youtube.com/watch?v=${youtubeMatch[1]}` : undefined)
    || vimeoMatch?.[1]
    || israeliPlayerMatch?.[1]
    || undefined;

  // Image extraction chain: og:image -> twitter:image -> first substantial img
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  coverImageUrl = ogImageMatch?.[1] || undefined;

  if (!coverImageUrl) {
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    coverImageUrl = twitterImageMatch?.[1] || undefined;
  }

  if (!coverImageUrl) {
    const imgMatches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
    for (const m of imgMatches) {
      const imgTag = m[0];
      const src = m[1];
      if (src.startsWith('data:')) continue;
      if (src.endsWith('.svg')) continue;
      if (!src.startsWith('http')) continue;
      const widthMatch = imgTag.match(/width=["']?(\d+)/i);
      if (widthMatch && parseInt(widthMatch[1]) < 200) continue;
      coverImageUrl = src;
      break;
    }
  }

  const fallbackGradient = coverImageUrl ? undefined : getSourceGradient(source, title);

  const cleanedHtml = cleanHtml(html);

  const ynetArticle = cleanedHtml.match(/<div[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  const articlePatterns = [
    /<div[^>]*class=["'][^"']*article[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*article[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*article[_-]?text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*story[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*story[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*item[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class=["'][^"']*post[_-]?(?:body|content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*entry[_-]?(?:body|content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*main[_-]?(?:content|text|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  let articleHtml = ynetArticle?.[1] || '';

  if (!articleHtml) {
    for (const pattern of articlePatterns) {
      const match = cleanedHtml.match(pattern);
      if (match?.[1] && match[1].length > 100) {
        articleHtml = match[1];
        break;
      }
    }
  }

  if (!articleHtml || articleHtml.length < 100) {
    articleHtml = cleanedHtml;
  }

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(articleHtml)) !== null) {
    const text = decodeHtmlEntities(pMatch[1].replace(/<[^>]+>/g, ''));
    if (text.length > 15 && !text.startsWith('function') && !text.includes('document.write')) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length < 3) {
    const divRegex = /<div[^>]*class=["'][^"']*(?:text|paragraph|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let divMatch;
    while ((divMatch = divRegex.exec(articleHtml)) !== null) {
      const text = decodeHtmlEntities(divMatch[1].replace(/<[^>]+>/g, ''));
      if (text.length > 30) {
        paragraphs.push(text);
      }
    }
  }

  content = paragraphs.join('\n\n');

  if (content.length < 100) {
    const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || cleanedHtml;
    const strippedText = decodeHtmlEntities(bodyHtml.replace(/<[^>]+>/g, ' '));
    const lines = strippedText.split(/\s{3,}/).filter(l => l.length > 20);
    content = lines.slice(0, 20).join('\n\n');
  }

  if (content.length > 5000) {
    content = content.slice(0, 5000) + '...';
  }

  return { title, content, date, source, coverImageUrl, videoUrl, fallbackGradient };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const articleUrl = searchParams.get('url');

    if (!articleUrl) {
      return NextResponse.json({ success: false, error: 'Missing url parameter' }, { status: 400 });
    }

    try {
      new URL(articleUrl);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
    }

    const cached = articleCache.get(articleUrl);
    if (cached && (Date.now() - cached.fetchedAt) < ARTICLE_CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch: ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const extracted = extractArticleContent(html, articleUrl);

    let smartSummary: string | undefined;
    if (extracted.content.length >= 100) {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `סכם את הכתבה הבאה ב-2 עד 3 פסקאות קצרות בעברית תקנית. כתוב רק את הסיכום, ללא כותרות או הקדמה. התמקד בעובדות המרכזיות ודלג על פרסומות, תפריטים, ומידע שאינו קשור לכתבה:\n\n${extracted.content.slice(0, 3000)}`,
          }],
        });
        if (msg.content[0].type === 'text') {
          smartSummary = msg.content[0].text;
        }
      } catch {
        // Silent degradation
      }
    }

    const result = { ...extracted, smartSummary, fetchedAt: Date.now() };
    articleCache.set(articleUrl, result);

    if (articleCache.size > 100) {
      const oldest = Array.from(articleCache.entries())
        .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
      if (oldest) articleCache.delete(oldest[0]);
    }

    return NextResponse.json({ success: true, ...extracted, smartSummary });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to extract article content',
    }, { status: 500 });
  }
}
