import { NextResponse } from 'next/server';
import { teams } from '@/lib/world-cup/static-data';
import type { WorldCupTeam } from '@/lib/world-cup/types';
import { getWC2026SeasonId, getSofaTopScorers, resolveStaticTeam } from '@/lib/world-cup/sofascore';

// OpenFootball fallback — always accessible, has goal scorers for completed matches
type OFGoal = { name?: string; minute?: string; type?: string };
type OFMatch = { team1?: string; team2?: string; score?: { ft?: [number, number] }; goals1?: OFGoal[]; goals2?: OFGoal[] };

const ofNameAliases: Record<string, string> = {
  'czech republic': 'czechia', 'usa': 'united states', 'ivory coast': "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire", 'turkey': 'türkiye', 'bosnia & herzegovina': 'bosnia and herzegovina',
  'korea republic': 'south korea', 'korea dpr': 'north korea', 'ir iran': 'iran', 'china pr': 'china',
};

function resolveOFTeam(name: string): WorldCupTeam {
  const norm = ofNameAliases[name.toLowerCase()] ?? name.toLowerCase();
  return Object.values(teams).find(t => t.nameEn.toLowerCase() === norm || t.nameEn.toLowerCase() === name.toLowerCase())
    ?? { id: 'tbd', nameHe: name, nameEn: name, flag: '🏳️' };
}

async function getOpenFootballStats(): Promise<{ goals: ReturnType<typeof toRanked>; assists: ReturnType<typeof toRanked>; yellowCards: ReturnType<typeof toRanked>; redCards: ReturnType<typeof toRanked> } | null> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rounds?: Array<{ matches?: OFMatch[] }>; matches?: OFMatch[] };
    const raw: OFMatch[] = [];
    if (data.rounds) data.rounds.forEach(r => raw.push(...(r.matches ?? [])));
    else if (data.matches) raw.push(...data.matches);
    if (!raw.length) return null;

    const goalsMap = new Map<string, StatEntry>();
    const assistsMap = new Map<string, StatEntry>();
    const yellowMap = new Map<string, StatEntry>();
    const redMap = new Map<string, StatEntry>();

    for (const m of raw) {
      if (!m.score?.ft) continue; // skip incomplete matches
      for (const [goals, teamName] of [[m.goals1 ?? [], m.team1 ?? ''], [m.goals2 ?? [], m.team2 ?? '']] as [OFGoal[], string][]) {
        const team = resolveOFTeam(teamName);
        for (const g of goals) {
          if (!g.name) continue;
          const isOwn = (g.type ?? '').toLowerCase().includes('own');
          if (!isOwn) inc(goalsMap, g.name, team);
        }
      }
    }

    const goals = toRanked(goalsMap);
    if (!goals.length) return null;
    return { goals, assists: toRanked(assistsMap), yellowCards: toRanked(yellowMap), redCards: toRanked(redMap) };
  } catch { return null; }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ESPNPlay = {
  type?: { text?: string };
  clock?: { displayValue?: string; value?: number };
  team?: { displayName?: string };
  participants?: Array<{ athlete?: { displayName?: string }; type?: { description?: string } }>;
  athletesInvolved?: Array<{ displayName?: string; type?: string }>;
};
type ESPNKeyEvent = {
  clock?: { displayValue?: string; value?: number };
  type?: { text?: string };
  team?: { displayName?: string };
  participants?: Array<{ athlete?: { displayName?: string }; type?: { description?: string } }>;
  text?: string;
  scoringPlay?: boolean;
  shootout?: boolean;
};
type ESPNSummary = { scoringPlays?: ESPNPlay[]; plays?: ESPNPlay[]; keyEvents?: ESPNKeyEvent[] };
type ESPNCompetitor = { team?: { displayName?: string }; homeAway?: string; score?: string };
type ESPNStatus = { type?: { name?: string; completed?: boolean } };
type ESPNEvent = {
  id?: string;
  date?: string;
  competitions?: Array<{ competitors?: ESPNCompetitor[]; status?: ESPNStatus }>;
  status?: ESPNStatus;
};

type StatEntry = { playerName: string; team: WorldCupTeam; count: number };

function resolveTeam(displayName?: string): WorldCupTeam {
  if (!displayName) return teams.tbd;
  const name = displayName.toLowerCase();
  const w0 = (s: string) => s.split(' ')[0];
  return Object.values(teams).find(t =>
    t.nameEn.toLowerCase() === name ||
    name.startsWith(w0(t.nameEn.toLowerCase())) ||
    t.nameEn.toLowerCase().startsWith(w0(name)),
  ) ?? { id: 'tbd', nameHe: displayName, nameEn: displayName, flag: '🏳️' };
}

function inc(map: Map<string, StatEntry>, player: string, team: WorldCupTeam) {
  const key = `${player}|${team.id}`;
  const e = map.get(key) ?? { playerName: player, team, count: 0 };
  map.set(key, { ...e, count: e.count + 1 });
}

function parseSummary(
  s: ESPNSummary,
  goals: Map<string, StatEntry>,
  assists: Map<string, StatEntry>,
  yellow: Map<string, StatEntry>,
  red: Map<string, StatEntry>,
  subs: Map<string, StatEntry>,
) {
  const hasScoringPlays = (s.scoringPlays?.length ?? 0) > 0;
  const hasDetailedPlays = (s.plays?.length ?? 0) > 0;

  for (const play of s.scoringPlays ?? []) {
    const isOwn = (play.type?.text ?? '').toLowerCase().includes('own');
    const team = resolveTeam(play.team?.displayName);
    const scorer = play.athletesInvolved?.[0]?.displayName
      ?? play.participants?.find(p => p.type?.description?.toLowerCase().includes('scor'))?.athlete?.displayName
      ?? play.participants?.[0]?.athlete?.displayName;
    if (scorer && !isOwn) inc(goals, scorer, team);
    const assister = play.athletesInvolved?.find(a => a.type?.toLowerCase().includes('assist'))?.displayName
      ?? play.participants?.find(p => p.type?.description?.toLowerCase().includes('assist'))?.athlete?.displayName;
    if (assister) inc(assists, assister, team);
  }
  for (const play of s.plays ?? []) {
    const text = (play.type?.text ?? '').toLowerCase();
    const team = resolveTeam(play.team?.displayName);
    const player = play.participants?.[0]?.athlete?.displayName ?? '';
    if (!player) continue;
    if (text.includes('yellow card') || text.includes('yellow-card')) inc(yellow, player, team);
    else if (text.includes('red card') || text.includes('red-card')) inc(red, player, team);
    else if (text.includes('substitut')) inc(subs, player, team);
  }

  // keyEvents — populated even when plays/scoringPlays are empty (WC 2026 ESPN behaviour)
  for (const ke of s.keyEvents ?? []) {
    const text = (ke.type?.text ?? '').toLowerCase();
    const team = resolveTeam(ke.team?.displayName);
    const scorer = ke.participants?.find(p => p.type?.description?.toLowerCase().includes('scor'))?.athlete?.displayName
      ?? ke.participants?.[0]?.athlete?.displayName ?? '';
    const isScoringPlay = ke.shootout !== true && (
      ke.scoringPlay === true || text.includes('goal') || text.includes('penalty - scored')
    );
    if (!hasScoringPlays && isScoringPlay && !text.includes('own')) {
      if (scorer) inc(goals, scorer, team);
      const assister = ke.participants?.find(p => p.type?.description?.toLowerCase().includes('assist'))?.athlete?.displayName
        ?? (ke.participants && ke.participants.length > 1 ? ke.participants[1]?.athlete?.displayName : undefined);
      if (assister && assister !== scorer) inc(assists, assister, team);
    } else if (!hasDetailedPlays && (text.includes('red card') || text.includes('red-card'))) {
      if (scorer) inc(red, scorer, team);
    } else if (!hasDetailedPlays && (text.includes('yellow card') || text.includes('yellow-card'))) {
      if (scorer) inc(yellow, scorer, team);
    } else if (!hasDetailedPlays && text.includes('substitut')) {
      if (scorer) inc(subs, scorer, team);
    }
  }
}

function toRanked(map: Map<string, StatEntry>) {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, playerName: e.playerName, team: e.team, count: e.count }));
}

// Treat an event as completed if status says so OR if kickoff was >3h ago (defensive fallback)
function isCompleted(ev: ESPNEvent): boolean {
  const status = ev.competitions?.[0]?.status ?? ev.status;
  if (status?.type?.completed === true) return true;
  if (status?.type?.name === 'STATUS_FINAL') return true;
  if (ev.date && Date.now() - new Date(ev.date).getTime() > 3 * 3_600_000) return true;
  return false;
}

function dedupeEvents(arrays: ESPNEvent[][]): ESPNEvent[] {
  const seen = new Set<string>();
  const out: ESPNEvent[] = [];
  for (const events of arrays) {
    for (const ev of events) {
      if (ev.id && !seen.has(ev.id)) { seen.add(ev.id); out.push(ev); }
      else if (!ev.id) out.push(ev);
    }
  }
  return out;
}

async function fetchRangeScoreboard(dateRange: string): Promise<ESPNEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateRange}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { events?: ESPNEvent[] };
    return data.events ?? [];
  } catch { return []; }
}

async function fetchDateScoreboard(dateStr: string): Promise<ESPNEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`,
      { cache: 'no-store', signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { events?: ESPNEvent[] };
    return data.events ?? [];
  } catch { return []; }
}

async function fetchDateEventsViaCoreApi(dateStr: string): Promise<ESPNEvent[]> {
  try {
    const res = await fetch(
      `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events?dates=${dateStr}&limit=30`,
      { cache: 'no-store', signal: AbortSignal.timeout(7000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { items?: Array<{ $ref?: string }> };
    const refs = (data.items ?? []).map(i => i.$ref).filter(Boolean) as string[];
    if (!refs.length) return [];
    const evData = await Promise.all(
      refs.slice(0, 20).map(ref =>
        fetch(ref, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ),
    );
    return evData.filter(Boolean).map(ev => ({
      id: ev.id as string,
      date: ev.date as string | undefined,
      competitions: ev.competitions as ESPNEvent['competitions'],
      status: ev.status as ESPNEvent['status'],
    })) as ESPNEvent[];
  } catch { return []; }
}

async function fetchDateEvents(dateStr: string): Promise<ESPNEvent[]> {
  const siteEvents = await fetchDateScoreboard(dateStr);
  if (siteEvents.length > 0) return siteEvents;
  return fetchDateEventsViaCoreApi(dateStr);
}

async function fetchESPNSummary(id: string): Promise<ESPNSummary | null> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`,
      { cache: 'no-store', signal: AbortSignal.timeout(6000) },
    );
    return res.ok ? (await res.json() as ESPNSummary) : null;
  } catch { return null; }
}

export async function GET() {
  // ── SofaScore: try as primary source first ──────────────────────────────
  try {
    const seasonId = await getWC2026SeasonId();
    if (seasonId) {
      const topScorers = await getSofaTopScorers(seasonId);
      if (topScorers && topScorers.length > 0) {
        type StatEntry = { playerName: string; team: WorldCupTeam; count: number };
        const goalsMap = new Map<string, StatEntry>();
        const assistsMap = new Map<string, StatEntry>();
        const yellowMap = new Map<string, StatEntry>();
        const redMap = new Map<string, StatEntry>();

        function sofaInc(map: Map<string, StatEntry>, player: string, teamObj: WorldCupTeam, n: number) {
          if (!player || n <= 0) return;
          const key = `${player}|${teamObj.id}`;
          const e = map.get(key) ?? { playerName: player, team: teamObj, count: 0 };
          map.set(key, { ...e, count: e.count + n });
        }

        for (const scorer of topScorers) {
          const teamObj: WorldCupTeam =
            resolveStaticTeam(scorer.team.name) ??
            { id: 'tbd', nameHe: scorer.team.name, nameEn: scorer.team.name, flag: '🏳️' };
          const name = scorer.player.name;
          const stats = scorer.statistics;
          sofaInc(goalsMap, name, teamObj, stats.goals ?? 0);
          sofaInc(assistsMap, name, teamObj, stats.assists ?? 0);
          sofaInc(yellowMap, name, teamObj, stats.yellowCards ?? 0);
          sofaInc(redMap, name, teamObj, stats.redCards ?? 0);
        }

        function sofaToRanked(map: Map<string, StatEntry>) {
          return Array.from(map.values())
            .filter(e => e.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
            .map((e, i) => ({ rank: i + 1, playerName: e.playerName, team: e.team, count: e.count }));
        }

        const sofaGoals = sofaToRanked(goalsMap);
        const sofaAssists = sofaToRanked(assistsMap);
        const sofaYellow = sofaToRanked(yellowMap);
        const sofaRed = sofaToRanked(redMap);

        // Only return SofaScore data if we got BOTH goals AND cards/assists — otherwise fall through to ESPN
        if (sofaGoals.length > 0 && (sofaYellow.length > 0 || sofaRed.length > 0 || sofaAssists.length > 1)) {
          return NextResponse.json(
            {
              success: true,
              goals: sofaGoals,
              assists: sofaAssists,
              yellowCards: sofaYellow,
              redCards: sofaRed,
              substitutions: [],
              source: 'sofascore',
            },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        }
      }
    }
  } catch { /* fall through to FD */ }

  // ── Football-Data.org: goals, assists, cards (requires token, works from Vercel) ────
  try {
    const fdToken = process.env.FOOTBALL_DATA_API_TOKEN?.trim();
    if (fdToken) {
      const [scorersRes, matchesRes] = await Promise.all([
        fetch('https://api.football-data.org/v4/competitions/WC/scorers?season=2026&limit=50', {
          headers: { 'X-Auth-Token': fdToken }, cache: 'no-store', signal: AbortSignal.timeout(8000),
        }),
        fetch('https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED', {
          headers: { 'X-Auth-Token': fdToken }, cache: 'no-store', signal: AbortSignal.timeout(8000),
        }),
      ]);

      const fdGoals = new Map<string, StatEntry>();
      const fdAssists = new Map<string, StatEntry>();
      const fdYellow = new Map<string, StatEntry>();
      const fdRed = new Map<string, StatEntry>();

      if (scorersRes.ok) {
        type FDScorer = {
          player?: { name?: string };
          team?: { name?: string };
          goals?: number; assists?: number;
          yellowCards?: number; redCards?: number;
        };
        const sd = await scorersRes.json() as { scorers?: FDScorer[] };
        for (const s of sd.scorers ?? []) {
          const team = resolveTeam(s.team?.name);
          const name = s.player?.name ?? '';
          if (!name) continue;
          const key = `${name}|${team.id}`;
          if ((s.goals ?? 0) > 0) fdGoals.set(key, { playerName: name, team, count: s.goals ?? 0 });
          if ((s.assists ?? 0) > 0) fdAssists.set(key, { playerName: name, team, count: s.assists ?? 0 });
          if ((s.yellowCards ?? 0) > 0) fdYellow.set(key, { playerName: name, team, count: s.yellowCards ?? 0 });
          if ((s.redCards ?? 0) > 0) fdRed.set(key, { playerName: name, team, count: s.redCards ?? 0 });
        }
      }

      if (matchesRes.ok) {
        type FDMatch = { id: number };
        const md = await matchesRes.json() as { matches?: FDMatch[] };
        const finishedIds = (md.matches ?? []).map(m => m.id);

        await Promise.all(finishedIds.slice(0, 10).map(async (matchId) => {
          try {
            const dr = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
              headers: { 'X-Auth-Token': fdToken }, cache: 'no-store', signal: AbortSignal.timeout(8000),
            });
            if (!dr.ok) return;
            const d = await dr.json() as {
              bookings?: Array<{ player?: { name?: string }; team?: { name?: string }; card?: string }>;
            };
            for (const b of d.bookings ?? []) {
              if (!b.player?.name) continue;
              const team = resolveTeam(b.team?.name);
              inc(b.card === 'RED_CARD' ? fdRed : fdYellow, b.player.name, team);
            }
          } catch { /* skip this match */ }
        }));
      }

      const fdGoalsList = toRanked(fdGoals);
      const fdYellowList = toRanked(fdYellow);
      // Only use FD when it has BOTH goals AND cards — free tier has cards=0, so we fall through to ESPN
      if (fdGoalsList.length > 0 && fdYellowList.length > 0) {
        return NextResponse.json({
          success: true,
          goals: fdGoalsList,
          assists: toRanked(fdAssists),
          yellowCards: fdYellowList,
          redCards: toRanked(fdRed),
          substitutions: [],
          source: 'football-data',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
  } catch { /* fall through to ESPN */ }

  // ── ESPN fallback ────────────────────────────────────────────────────────
  const wcStart = '20260611';
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // First try: single date-range query to get all tournament events at once
  let allEvents = await fetchRangeScoreboard(`${wcStart}-${todayStr}`);

  // Fallback: iterate per day (site scoreboard) → Core API per day
  if (!allEvents.length) {
    const tourStart = new Date('2026-06-11');
    const today = new Date();
    const dates: string[] = [];
    for (let d = new Date(tourStart); d <= today; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    const arrays = await Promise.all(dates.map(fetchDateEvents));
    allEvents = dedupeEvents(arrays);
  }

  const seen = new Set<string>();
  const completedIds: string[] = [];
  for (const ev of allEvents) {
    if (ev.id && !seen.has(ev.id) && isCompleted(ev)) {
      seen.add(ev.id);
      completedIds.push(ev.id);
    }
  }

  const summaries = await Promise.all(completedIds.map(fetchESPNSummary));

  const goals = new Map<string, StatEntry>();
  const assists = new Map<string, StatEntry>();
  const yellow = new Map<string, StatEntry>();
  const red = new Map<string, StatEntry>();
  const subs = new Map<string, StatEntry>();

  for (const s of summaries) {
    if (s) parseSummary(s, goals, assists, yellow, red, subs);
  }

  const espnGoals = toRanked(goals);
  if (espnGoals.length > 0) {
    return NextResponse.json({
      success: true,
      goals: espnGoals,
      assists: toRanked(assists),
      yellowCards: toRanked(yellow),
      redCards: toRanked(red),
      substitutions: toRanked(subs),
      source: 'espn',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Final fallback: OpenFootball — always accessible, goals only
  const ofStats = await getOpenFootballStats();
  return NextResponse.json({
    success: true,
    goals: ofStats?.goals ?? [],
    assists: ofStats?.assists ?? [],
    yellowCards: ofStats?.yellowCards ?? [],
    redCards: ofStats?.redCards ?? [],
    substitutions: [],
    source: ofStats ? 'openfootball' : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
