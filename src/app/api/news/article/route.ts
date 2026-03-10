import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simple article cache
const articleCache = new Map<string, { content: string; title: string; date: string; source: string; fetchedAt: number }>();
const ARTICLE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

function extractArticleContent(html: string, url: string): { title: string; content: string; date: string; source: string } {
  let title = '';
  let content = '';
  let date = '';
  let source = '';

  // Extract title
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

  // Extract source
  const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:site_name["']/i);
  source = decodeHtmlEntities(siteNameMatch?.[1] || '');
  if (!source) {
    try { source = new URL(url).hostname.replace('www.', ''); } catch { source = ''; }
  }

  // Extract date
  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*name=["'](?:date|publish[_-]?date|pubdate)["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<time[^>]*datetime=["']([^"']*?)["']/i);
  date = dateMatch?.[1] || '';

  // Clean the HTML
  const cleanedHtml = cleanHtml(html);

  // Ynet specific: look for "text" class divs
  const ynetArticle = cleanedHtml.match(/<div[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  // Try various article container patterns
  const articlePatterns = [
    // Ynet-specific
    /<div[^>]*class=["'][^"']*article[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*article[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*article[_-]?text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    // 13tv / Mako
    /<div[^>]*class=["'][^"']*story[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*story[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    // Walla
    /<div[^>]*class=["'][^"']*item[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    // Generic
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

  // If no container found, use whole body
  if (!articleHtml || articleHtml.length < 100) {
    articleHtml = cleanedHtml;
  }

  // Extract text from paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(articleHtml)) !== null) {
    const text = decodeHtmlEntities(pMatch[1].replace(/<[^>]+>/g, ''));
    // Filter: must be real content (>15 chars), skip ad/navigation text
    if (text.length > 15 && !text.startsWith('function') && !text.includes('document.write')) {
      paragraphs.push(text);
    }
  }

  // Also try <div> elements with text if paragraphs are sparse
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

  // Fallback: strip all HTML and get raw text
  if (content.length < 100) {
    const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || cleanedHtml;
    const strippedText = decodeHtmlEntities(bodyHtml.replace(/<[^>]+>/g, ' '));

    // Try to get a reasonable portion from the middle (skip navigation)
    const lines = strippedText.split(/\s{3,}/).filter(l => l.length > 20);
    content = lines.slice(0, 20).join('\n\n');
  }

  // Limit content length
  if (content.length > 5000) {
    content = content.slice(0, 5000) + '...';
  }

  return { title, content, date, source };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const articleUrl = searchParams.get('url');

    if (!articleUrl) {
      return NextResponse.json({ success: false, error: 'Missing url parameter' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(articleUrl);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
    }

    // Check cache
    const cached = articleCache.get(articleUrl);
    if (cached && (Date.now() - cached.fetchedAt) < ARTICLE_CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached });
    }

    // Fetch the article
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

    // Cache the result
    const result = { ...extracted, fetchedAt: Date.now() };
    articleCache.set(articleUrl, result);

    // Limit cache size
    if (articleCache.size > 100) {
      const oldest = Array.from(articleCache.entries())
        .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
      if (oldest) articleCache.delete(oldest[0]);
    }

    return NextResponse.json({ success: true, ...extracted });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to extract article content',
    }, { status: 500 });
  }
}
