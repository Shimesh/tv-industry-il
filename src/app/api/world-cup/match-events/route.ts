import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ESPN soccer summary endpoint — free, no key required
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world';

type ESPNAthlete = {
  displayName?: string;
};
type ESPNParticipant = {
  athlete?: ESPNAthlete;
  type?: { description?: string };
};
type ESPNPlay = {
  type?: { text?: string; id?: string };
  clock?: { displayValue?: string; value?: number };
  team?: { displayName?: string; abbreviation?: string };
  participants?: ESPNParticipant[];
  athletesInvolved?: Array<{ displayName?: string; type?: string }>;
  text?: string;
  scoringPlay?: boolean;
};
type ESPNSummary = {
  scoringPlays?: ESPNPlay[];
  plays?: ESPNPlay[];
  header?: {
    competitions?: Array<{
      status?: { clock?: number; period?: number; type?: { completed?: boolean; name?: string } };
      competitors?: Array<{ team?: { displayName?: string }; score?: string; homeAway?: string }>;
    }>;
  };
};

type ESPNScoreboardEvent = {
  id?: string;
  competitions?: Array<{
    competitors?: Array<{ team?: { displayName?: string; abbreviation?: string }; homeAway?: string }>;
  }>;
};

function parseMinute(play: ESPNPlay): number {
  if (typeof play.clock?.value === 'number') return Math.round(play.clock.value / 60);
  const disp = play.clock?.displayValue ?? '';
  const m = disp.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function normalizeType(text?: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('own goal') || t.includes('own-goal')) return 'owngoal';
  if (t.includes('goal') || t.includes('score')) return 'goal';
  if (t.includes('red card') || t.includes('red-card')) return 'redcard';
  if (t.includes('yellow card') || t.includes('yellow-card')) return 'yellowcard';
  if (t.includes('substitut') || t.includes('sub out') || t.includes('sub in')) return 'substitution';
  return null;
}

type CoreRef = { $ref?: string };
type CoreEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  competitions?: Array<{ competitors?: Array<{ team?: { displayName?: string; abbreviation?: string } }> }>;
};

async function findESPNEventIdViaCore(dateStr: string, homeEn: string, awayEn: string): Promise<string | null> {
  const home = homeEn.toLowerCase();
  const away = awayEn.toLowerCase();
  const word0 = (s: string) => s.split(' ')[0];

  async function searchRefs(refs: string[]): Promise<string | null> {
    const evs = await Promise.all(
      refs.slice(0, 20).map(ref =>
        fetch(ref, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
          .then(r => r.ok ? r.json() as Promise<CoreEvent> : null)
          .catch(() => null),
      ),
    );
    for (const ev of evs) {
      if (!ev?.id) continue;
      const name = ((ev.name ?? ev.shortName ?? '') as string).toLowerCase();
      if (name.includes(word0(home)) && name.includes(word0(away))) return ev.id;
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const names = comps.map(c => (c.team?.displayName ?? '').toLowerCase());
      const hasHome = names.some(n => n && (n.startsWith(word0(home)) || home.startsWith(word0(n))));
      const hasAway = names.some(n => n && (n.startsWith(word0(away)) || away.startsWith(word0(n))));
      if (hasHome && hasAway) return ev.id;
    }
    return null;
  }

  for (const query of [`dates=${dateStr}`, 'season=2026&limit=100']) {
    try {
      const res = await fetch(`${ESPN_CORE}/events?${query}&limit=30`, {
        cache: 'no-store', signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { items?: CoreRef[] };
      const refs = (data.items ?? []).map(i => i.$ref).filter(Boolean) as string[];
      if (refs.length) {
        const id = await searchRefs(refs);
        if (id) return id;
      }
    } catch { /* try next */ }
  }
  return null;
}

async function findESPNEventId(homeTeamEn: string, awayTeamEn: string, kickoffDate?: string): Promise<string | null> {
  const word0 = (s: string) => s.split(' ')[0].toLowerCase();
  const home = homeTeamEn.toLowerCase();
  const away = awayTeamEn.toLowerCase();

  function searchEvents(events: ESPNScoreboardEvent[]): string | null {
    const found = events.find(ev => {
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const names = comps.map(c => (c.team?.displayName ?? '').toLowerCase());
      const hasHome = names.some(n => n && (n === home || n.startsWith(word0(home)) || home.startsWith(word0(n))));
      const hasAway = names.some(n => n && (n === away || n.startsWith(word0(away)) || away.startsWith(word0(n))));
      return hasHome && hasAway;
    });
    return found?.id ?? null;
  }

  // Build list of scoreboard URLs to try: live + date-specific for kickoff date and today
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dates = new Set([today]);
  if (kickoffDate) dates.add(kickoffDate.replace(/-/g, '').slice(0, 8));

  const urls = [
    ESPN_SCOREBOARD,
    ...[...dates].map(d => `${ESPN_SCOREBOARD}?dates=${d}`),
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json() as { events?: ESPNScoreboardEvent[] };
      const id = searchEvents(data.events ?? []);
      if (id) return id;
    } catch { /* try next */ }
  }

  // Site API didn't find it — try Core API (retains historical data)
  if (kickoffDate) {
    const dateStr = kickoffDate.replace(/-/g, '').slice(0, 8);
    const coreId = await findESPNEventIdViaCore(dateStr, homeTeamEn, awayTeamEn);
    if (coreId) return coreId;
  }

  return null;
}

async function fetchESPNSummary(espnId: string): Promise<ESPNSummary | null> {
  try {
    const res = await fetch(`${ESPN_SUMMARY}${espnId}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json() as ESPNSummary;
  } catch {
    return null;
  }
}

function parseSummary(data: ESPNSummary): { events: object[]; minute: number | null } {
  const events: { type: string; minute: number; teamName: string; player: string; detail: string }[] = [];

  // Parse scoring plays (goals)
  for (const play of data.scoringPlays ?? []) {
    const type = normalizeType(play.type?.text);
    if (!type) continue;
    const minute = parseMinute(play);
    const teamName = play.team?.displayName ?? '';
    const athlete = play.athletesInvolved?.[0]?.displayName
      ?? play.participants?.find(p => p.type?.description?.toLowerCase().includes('scor'))?.athlete?.displayName
      ?? play.participants?.[0]?.athlete?.displayName
      ?? '';
    const assist = play.athletesInvolved?.find(a => a.type?.toLowerCase().includes('assist'))?.displayName
      ?? play.participants?.find(p => p.type?.description?.toLowerCase().includes('assist'))?.athlete?.displayName;
    events.push({
      type,
      minute,
      teamName,
      player: athlete,
      detail: assist ? `בישול: ${assist}` : (type === 'owngoal' ? 'שער עצמי' : ''),
    });
  }

  // Parse all plays for cards and substitutions
  for (const play of data.plays ?? []) {
    const type = normalizeType(play.type?.text);
    if (!type || type === 'goal' || type === 'owngoal') continue; // goals already covered
    const minute = parseMinute(play);
    const teamName = play.team?.displayName ?? '';
    const players = play.participants ?? [];
    const mainPlayer = players[0]?.athlete?.displayName ?? play.text ?? '';
    const subOut = type === 'substitution'
      ? players.find(p => p.type?.description?.toLowerCase().includes('out'))?.athlete?.displayName ?? players[1]?.athlete?.displayName
      : undefined;
    events.push({
      type,
      minute,
      teamName,
      player: mainPlayer,
      detail: subOut ? `יצא: ${subOut}` : '',
    });
  }

  // Sort newest first
  events.sort((a, b) => b.minute - a.minute);

  // Current match minute from header
  const comp = data.header?.competitions?.[0];
  const rawClock = comp?.status?.clock;
  const minute = typeof rawClock === 'number' ? Math.round(rawClock / 60) : null;

  return { events, minute };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const matchId = sp.get('matchId') ?? '';
  const espnIdParam = sp.get('espnId') ?? '';
  const homeTeam = sp.get('home') ?? '';
  const awayTeam = sp.get('away') ?? '';
  const kickoffDate = sp.get('date') ?? '';

  // Resolve ESPN event ID: use explicit param, or look up from scoreboard by team names
  let espnId = espnIdParam;
  if (!espnId && homeTeam && awayTeam) {
    espnId = await findESPNEventId(homeTeam, awayTeam, kickoffDate) ?? '';
  }

  // Fallback to football-data.org if no ESPN ID and matchId is numeric
  if (!espnId) {
    const token = process.env.FOOTBALL_DATA_API_TOKEN?.trim();
    if (matchId && /^\d+$/.test(matchId) && token) {
      try {
        const res = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
          headers: { 'X-Auth-Token': token },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          type RawGoal = { minute?: number; team?: { name?: string }; scorer?: { name?: string }; assist?: { name?: string }; type?: string };
          type RawBooking = { minute?: number; team?: { name?: string }; player?: { name?: string }; card?: string };
          type RawSub = { minute?: number; team?: { name?: string }; playerIn?: { name?: string }; playerOut?: { name?: string } };
          const evts = [
            ...(data.goals ?? []).map((g: RawGoal) => ({ type: g.type === 'OWN' ? 'owngoal' : 'goal', minute: g.minute ?? 0, teamName: g.team?.name ?? '', player: g.scorer?.name ?? '', detail: g.assist?.name ? `בישול: ${g.assist.name}` : (g.type === 'OWN' ? 'שער עצמי' : '') })),
            ...(data.bookings ?? []).map((b: RawBooking) => ({ type: b.card === 'RED_CARD' ? 'redcard' : 'yellowcard', minute: b.minute ?? 0, teamName: b.team?.name ?? '', player: b.player?.name ?? '', detail: '' })),
            ...(data.substitutions ?? []).map((s: RawSub) => ({ type: 'substitution', minute: s.minute ?? 0, teamName: s.team?.name ?? '', player: s.playerIn?.name ?? '', detail: s.playerOut?.name ? `יצא: ${s.playerOut.name}` : '' })),
          ].sort((a, b) => b.minute - a.minute);
          return NextResponse.json({ success: true, minute: data.minute ?? null, events: evts }, { headers: { 'Cache-Control': 'no-store' } });
        }
      } catch { /* fall through */ }
    }
    return NextResponse.json({ success: false, events: [], minute: null });
  }

  const summary = await fetchESPNSummary(espnId);
  if (!summary) return NextResponse.json({ success: false, events: [], minute: null });

  const { events, minute } = parseSummary(summary);
  return NextResponse.json({ success: true, minute, events }, { headers: { 'Cache-Control': 'no-store' } });
}
