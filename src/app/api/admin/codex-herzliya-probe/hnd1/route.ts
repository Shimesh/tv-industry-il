import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';
export const maxDuration = 30;

const TOKEN = 'codex-region-20260710-9ba9ac';
const URL =
  'https://hsil.acc.co.il:5443/sendwa.html?A=A8A2047B-C268-4426-8276-FC80F3960DD0,18072026';

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch(URL, { cache: 'no-store', signal: controller.signal });
    const html = await response.text();
    return NextResponse.json({
      ok: true,
      region: 'hnd1',
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      htmlLength: html.length,
      hasCalendar: html.includes('calendar-header'),
      hasShowEmp6: html.includes('ShowEmp6'),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        region: 'hnd1',
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
