import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RawGoal = { minute?: number; team?: { name?: string }; scorer?: { name?: string }; assist?: { name?: string }; type?: string };
type RawBooking = { minute?: number; team?: { name?: string }; player?: { name?: string }; card?: string };
type RawSub = { minute?: number; team?: { name?: string }; playerIn?: { name?: string }; playerOut?: { name?: string } };

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get('matchId');
  const token = process.env.FOOTBALL_DATA_API_TOKEN?.trim();

  if (!matchId || !/^\d+$/.test(matchId) || !token) {
    return NextResponse.json({ success: false, events: [], minute: null });
  }

  try {
    const res = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return NextResponse.json({ success: false, events: [], minute: null });

    const data = await res.json();

    const events = [
      ...(data.goals ?? []).map((g: RawGoal) => ({
        type: g.type === 'OWN' ? 'owngoal' : 'goal',
        minute: g.minute ?? 0,
        teamName: g.team?.name ?? '',
        player: g.scorer?.name ?? '',
        detail: g.assist?.name ? `בישול: ${g.assist.name}` : g.type === 'OWN' ? 'שער עצמי' : '',
      })),
      ...(data.bookings ?? []).map((b: RawBooking) => ({
        type: b.card === 'RED_CARD' ? 'redcard' : 'yellowcard',
        minute: b.minute ?? 0,
        teamName: b.team?.name ?? '',
        player: b.player?.name ?? '',
        detail: '',
      })),
      ...(data.substitutions ?? []).map((s: RawSub) => ({
        type: 'substitution',
        minute: s.minute ?? 0,
        teamName: s.team?.name ?? '',
        player: s.playerIn?.name ?? '',
        detail: s.playerOut?.name ? `יצא: ${s.playerOut.name}` : '',
      })),
    ].sort((a, b) => b.minute - a.minute);

    return NextResponse.json({
      success: true,
      minute: data.minute ?? null,
      homeScore: data.score?.fullTime?.home ?? data.score?.halfTime?.home ?? null,
      awayScore: data.score?.fullTime?.away ?? data.score?.halfTime?.away ?? null,
      events,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, events: [], minute: null });
  }
}
