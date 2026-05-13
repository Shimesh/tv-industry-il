import { NextRequest, NextResponse } from 'next/server';
import { getVenueWeather } from '@/lib/world-cup/data';

export const runtime = 'nodejs';
export const revalidate = 1800;

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get('venueId')?.trim() || '';
  if (!venueId) {
    return NextResponse.json({ error: 'Missing venueId' }, { status: 400 });
  }

  const weather = await getVenueWeather(venueId);
  if (!weather) {
    return NextResponse.json({ error: 'Venue weather unavailable' }, { status: 404 });
  }

  return NextResponse.json({ success: true, weather }, {
    headers: {
      'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
