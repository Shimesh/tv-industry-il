import { NextResponse } from 'next/server';
import { deriveStandingsFromMatches, getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ matches, source, updatedAt }, { standings: apiStandings, source: standingsSource }, playerStats] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
    getWorldCupPlayerStats(),
  ]);

  // If all API standings show 0 played games, derive from finished match results instead
  const allZero = apiStandings.every(s => s.played === 0);
  const finished = matches.filter(m => m.status === 'finished' && m.homeScore != null && m.awayScore != null);
  const standings = (allZero && finished.length > 0) ? deriveStandingsFromMatches(finished) : apiStandings;

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
