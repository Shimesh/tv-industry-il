import { NextRequest, NextResponse } from 'next/server';
import { findSofaEventId, getSofaLineups } from '@/lib/world-cup/sofascore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineupPlayer = {
  id: number;
  name: string;
  jerseyNumber: number;
  position: string;
  isStarter: boolean;
};

type LineupTeam = {
  formation: string;
  players: LineupPlayer[];
};

function mapPosition(sofaPos: string): string {
  switch (sofaPos?.toUpperCase()) {
    case 'G': return 'GK';
    case 'D': return 'DEF';
    case 'M': return 'MID';
    case 'F': return 'FWD';
    default: return sofaPos ?? '';
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const homeParam = sp.get('home') ?? '';
  const awayParam = sp.get('away') ?? '';
  const dateParam = sp.get('date') ?? '';
  const sofaIdParam = sp.get('sofaId') ?? '';

  // Resolve event ID
  let eventId: number | null = null;

  if (sofaIdParam) {
    const parsed = parseInt(sofaIdParam, 10);
    if (!isNaN(parsed)) eventId = parsed;
  }

  if (!eventId && homeParam && awayParam && dateParam) {
    // dateParam may be YYYYMMDD or YYYY-MM-DD; normalize to YYYY-MM-DD
    const dateISO = dateParam.length === 8
      ? `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`
      : dateParam;
    eventId = await findSofaEventId(homeParam, awayParam, dateISO);
  }

  if (!eventId) {
    return NextResponse.json(
      { success: false, error: 'Could not resolve event ID' },
      { status: 404 },
    );
  }

  const lineup = await getSofaLineups(eventId);

  if (!lineup) {
    return NextResponse.json(
      { success: false, error: 'Lineup not available' },
      { status: 404 },
    );
  }

  function buildTeam(side: import('@/lib/world-cup/sofascore').SofaLineupTeam): LineupTeam {
    const players: LineupPlayer[] = (side.players ?? []).map(p => ({
      id: p.player.id,
      name: p.player.name,
      jerseyNumber: parseInt(p.player.jerseyNumber ?? '0', 10) || 0,
      position: mapPosition(p.position),
      isStarter: !p.substitute,
    }));
    return {
      formation: side.formation ?? '',
      players,
    };
  }

  return NextResponse.json(
    {
      success: true,
      home: buildTeam(lineup.home),
      away: buildTeam(lineup.away),
    },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
  );
}
