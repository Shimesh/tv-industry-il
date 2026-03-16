import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;

  try {
    if (channel === 'kan11') {
      // Try to extract fresh m3u8 URL from kan.org.il
      const response = await fetch('https://www.kan.org.il/live/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await response.text();
      const m3u8Match = html.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/)?.[0];

      if (m3u8Match) {
        return NextResponse.json({
          url: m3u8Match,
          expires: Date.now() + 3600000, // 1 hour
        });
      }
    }

    if (channel === 'kan33') {
      const response = await fetch('https://www.kan.org.il/live/tv.aspx?stationid=3', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await response.text();
      const m3u8Match = html.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/)?.[0];

      if (m3u8Match) {
        return NextResponse.json({
          url: m3u8Match,
          expires: Date.now() + 3600000,
        });
      }
    }

    return NextResponse.json({ url: null }, { status: 404 });
  } catch {
    return NextResponse.json({ url: null, error: 'Failed to fetch token' }, { status: 500 });
  }
}
