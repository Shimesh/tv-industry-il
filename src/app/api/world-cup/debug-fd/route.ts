import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const matchId = sp.get('matchId') ?? '';
  const token = process.env.FOOTBALL_DATA_API_TOKEN?.trim();

  if (!token) {
    return NextResponse.json({ error: 'No FOOTBALL_DATA_API_TOKEN in env' });
  }

  // Test: WC finished matches
  const matchesRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED',
    { headers: { 'X-Auth-Token': token }, cache: 'no-store' },
  );
  const matchesData = matchesRes.ok
    ? await matchesRes.json() as { matches?: Array<{ id: number; homeTeam?: { name?: string }; awayTeam?: { name?: string }; status?: string }> }
    : { error: matchesRes.status };

  // For all finished matches, also fetch quick detail to show events counts
  const matches = ('matches' in matchesData ? matchesData.matches : undefined) ?? [];
  const matchDetails = await Promise.all(
    matches.slice(0, 5).map(async (m) => {
      try {
        const dr = await fetch(`https://api.football-data.org/v4/matches/${m.id}`, {
          headers: { 'X-Auth-Token': token }, cache: 'no-store', signal: AbortSignal.timeout(6000),
        });
        if (!dr.ok) return { id: m.id, match: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, error: dr.status };
        const d = await dr.json() as Record<string, unknown>;
        const goals = d.goals as unknown[] | undefined;
        const bookings = d.bookings as unknown[] | undefined;
        const subs = d.substitutions as unknown[] | undefined;
        return {
          id: m.id,
          match: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`,
          status: d.status,
          goalsCount: goals?.length ?? 0,
          bookingsCount: bookings?.length ?? 0,
          subsCount: subs?.length ?? 0,
          bookings,
        };
      } catch (e) {
        return { id: m.id, match: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, error: String(e) };
      }
    }),
  );

  // Test: specific match detail if matchId provided
  let matchDetail = null;
  if (matchId && /^\d+$/.test(matchId)) {
    const detailRes = await fetch(
      `https://api.football-data.org/v4/matches/${matchId}`,
      { headers: { 'X-Auth-Token': token }, cache: 'no-store' },
    );
    if (detailRes.ok) {
      const d = await detailRes.json() as Record<string, unknown>;
      const goals = d.goals as Array<Record<string, unknown>> | undefined;
      const bookings = d.bookings as Array<Record<string, unknown>> | undefined;
      const subs = d.substitutions as Array<Record<string, unknown>> | undefined;
      matchDetail = {
        id: d.id,
        status: d.status,
        goalsCount: goals?.length ?? 0,
        goals,
        bookingsCount: bookings?.length ?? 0,
        bookings,
        subsCount: subs?.length ?? 0,
      };
    } else {
      matchDetail = { error: detailRes.status, body: await detailRes.text() };
    }
  }

  // Also fetch scorers to see if yellowCards/redCards are populated
  const scorersRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/scorers?season=2026&limit=20',
    { headers: { 'X-Auth-Token': token }, cache: 'no-store' },
  );
  type FDScorer = { player?: { name?: string }; goals?: number; yellowCards?: number; redCards?: number };
  const scorersData = scorersRes.ok
    ? (await scorersRes.json() as { scorers?: FDScorer[] }).scorers?.map(s => ({
        player: s.player?.name,
        goals: s.goals ?? 0,
        yellowCards: s.yellowCards ?? 0,
        redCards: s.redCards ?? 0,
      }))
    : null;

  return NextResponse.json({
    tokenLength: token.length,
    finishedMatchesCount: matches.length,
    matchDetails,
    scorers: scorersData,
    matchDetail,
  });
}
