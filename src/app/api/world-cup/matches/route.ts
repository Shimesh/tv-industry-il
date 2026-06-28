import { NextResponse } from 'next/server';
import { getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ matches, source, updatedAt }, { standings: apiStandings, source: standingsSource }, playerStats] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
    getWorldCupPlayerStats(),
  ]);

  const hasLive = matches.some(m => m.status === 'live');
  // During a live match: bypass CDN cache so ESPN scores are always real-time.
  // When idle: allow CDN to cache for up to 60s to reduce serverless invocations.
  const cacheHeader = hasLive
    ? 'no-store'
    : 's-maxage=60, stale-while-revalidate=120';

  return NextResponse.json({
    success: true,
    source,
    standingsSource,
    updatedAt,
    matches,
    standings: apiStandings,
    playerStats,
    venues: getWorldCupVenues(),
  }, {
    headers: {
      'Cache-Control': cacheHeader,
    },
  });
}
