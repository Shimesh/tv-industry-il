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

  const matches = ('matches' in matchesData ? matchesData.matches : undefined) ?? [];
  return NextResponse.json({
    tokenLength: token.length,
    finishedMatchesCount: matches.length,
    matchIds: matches.map(m => ({ id: m.id, match: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, status: m.status })),
    matchDetail,
  });
}
