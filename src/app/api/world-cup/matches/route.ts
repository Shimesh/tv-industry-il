import { NextResponse } from 'next/server';
import { getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ matches, source, updatedAt }, { standings, source: standingsSource }, playerStats] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
    getWorldCupPlayerStats(),
  ]);

  const hasLive = matches.some(m => m.status === 'live');
  const ttl = hasLive ? 30 : 60;

  return NextResponse.json({
    success: true,
    source,
    standingsSource,
    updatedAt,
    matches,
    standings,
    playerStats,
    venues: getWorldCupVenues(),
  }, {
    headers: {
      'Cache-Control': `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
    },
  });
}
