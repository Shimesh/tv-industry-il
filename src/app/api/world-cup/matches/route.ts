import { NextResponse } from 'next/server';
import { getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET() {
  const [{ matches, source, updatedAt }, { standings, source: standingsSource }] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
  ]);

  return NextResponse.json({
    success: true,
    source,
    standingsSource,
    updatedAt,
    matches,
    standings,
    playerStats: getWorldCupPlayerStats(),
    venues: getWorldCupVenues(),
  }, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
    },
  });
}
