import { NextRequest, NextResponse } from 'next/server';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    });
    return await response.text();
  } catch {
    return null;
  }
}

function extractM3u8(html: string): string | null {
  const patterns = [
    /https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/,
    /"(https:\/\/[^"]+\.m3u8[^"]*)"/,
    /'(https:\/\/[^']+\.m3u8[^']*)'/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;

  try {
    // === כאן 11 — static CDN URL is preferred; this is a dynamic fallback ===
    if (channel === 'kan11') {
      const html = await fetchPage('https://www.kan.org.il/live/');
      if (html) {
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
      // Return known stable CDN as fallback
      return NextResponse.json({
        url: 'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8',
        expires: Date.now() + 3600000,
      });
    }

    // === כאן 33 ===
    if (channel === 'kan33') {
      const html = await fetchPage('https://www.kan.org.il/live/tv.aspx?stationid=3');
      if (html) {
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
    }

    // === רשת 13 — scrape for latest URL; fallback to known stable CloudFront URLs ===
    if (channel === 'reshet13') {
      const html = await fetchPage('https://13tv.co.il/live/');
      if (html) {
        // Prefer CloudFront URLs (more stable than g-mana session URLs)
        const cloudFrontMatch = html.match(/https:\/\/[^"']+cloudfront\.net[^"']+\.m3u8[^"']*/);
        if (cloudFrontMatch) {
          return NextResponse.json({ url: cloudFrontMatch[0], expires: Date.now() + 3600000 });
        }
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
      // Fallback: known stable CloudFront URLs for Reshet 13
      return NextResponse.json({
        url: 'https://d2xg1g9o5vns8m.cloudfront.net/out/v1/66d4ac8748ce4a9298b4e40e48d1ae2f/index.m3u8',
        expires: Date.now() + 3600000,
      });
    }

    return NextResponse.json({ url: null }, { status: 404 });
  } catch {
    return NextResponse.json({ url: null, error: 'Failed to fetch stream' }, { status: 500 });
  }
}
