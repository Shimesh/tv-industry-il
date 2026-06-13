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

  // Derive standings only from finished matches whose kickoff is already in the past —
  // guards against APIs that pre-populate future matches with scores
  const now = Date.now();
  const finished = matches.filter(m =>
    m.status === 'finished' &&
    m.homeScore != null &&
    m.awayScore != null &&
    (!m.kickoff || Date.parse(m.kickoff) < now),
  );
  const standings = finished.length > 0 ? deriveStandingsFromMatches(finished) : apiStandings;

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
    standings,
    playerStats,
    venues: getWorldCupVenues(),
  }, {
    headers: {
      'Cache-Control': cacheHeader,
    },
  });
}
