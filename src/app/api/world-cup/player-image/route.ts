import { NextRequest, NextResponse } from 'next/server';
import { SOFA_HEADERS } from '@/lib/world-cup/sofascore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const playerId = sp.get('playerId') ?? '';

  if (!playerId || !/^\d+$/.test(playerId)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.sofascore.com/api/v1/player/${playerId}/image`,
      {
        headers: SOFA_HEADERS,
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const contentType = res.headers.get('content-type') ?? 'image/png';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
