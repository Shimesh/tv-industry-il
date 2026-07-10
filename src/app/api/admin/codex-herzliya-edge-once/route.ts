import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const TOKEN = 'codex-edge-20260710-6d9d0a72';
const URL =
  'https://hsil.acc.co.il:5443/sendwa.html?A=A8A2047B-C268-4426-8276-FC80F3960DD0,18072026';

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(URL, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await response.text();
    return NextResponse.json({
      ok: true,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      finalUrl: response.url,
      htmlLength: html.length,
      hasCalendar: html.includes('calendar-header'),
      hasShowEmp6: html.includes('ShowEmp6'),
      preview: html.slice(0, 500),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
