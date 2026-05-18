import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MIDRUG_BASE = 'https://midrug.safenet.co.il';
const TIMEOUT_MS = 15_000;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path') || '/ajax_info.asp';
  const params = request.nextUrl.searchParams.get('params') || '';

  const targetUrl = `${MIDRUG_BASE}${path}${params ? '?' + params : ''}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        Referer: 'https://midrug.safenet.co.il/app/',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: `Midrug returned ${response.status}` }, { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=windows-1255',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edge proxy fetch failed' },
      { status: 502 },
    );
  }
}
