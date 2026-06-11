import { NextResponse } from 'next/server';
import { getWorldCupMatches, getWorldCupPlayerStats } from '@/lib/world-cup/data';
import { teams } from '@/lib/world-cup/static-data';
import type { WorldCupTeam } from '@/lib/world-cup/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ESPNPlay = {
  type?: { text?: string };
  clock?: { displayValue?: string; value?: number };
  team?: { displayName?: string };
  participants?: Array<{ athlete?: { displayName?: string }; type?: { description?: string } }>;
  athletesInvolved?: Array<{ displayName?: string; type?: string }>;
};
type ESPNSummary = { scoringPlays?: ESPNPlay[]; plays?: ESPNPlay[] };
type ESPNCompetitor = { team?: { displayName?: string }; homeAway?: string };
type ESPNEvent = { id?: string; competitions?: Array<{ competitors?: ESPNCompetitor[] }> };

type StatEntry = { playerName: string; team: WorldCupTeam; count: number };

function resolveTeam(displayName?: string): WorldCupTeam {
  if (!displayName) return teams.tbd;
  const name = displayName.toLowerCase();
  return Object.values(teams).find(t =>
    t.nameEn.toLowerCase() === name || name.startsWith(t.nameEn.toLowerCase().split(' ')[0]),
  ) ?? { id: 'tbd', nameHe: displayName, nameEn: displayName, flag: '🏳️' };
}

function parseMinute(play: ESPNPlay): number {
  if (typeof play.clock?.value === 'number') return Math.round(play.clock.value / 60);
  const m = (play.clock?.displayValue ?? '').match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
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
) {
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
    if (!text.includes('yellow') && !text.includes('red card')) continue;
    const team = resolveTeam(play.team?.displayName);
    const player = play.participants?.[0]?.athlete?.displayName ?? '';
    if (!player) continue;
    inc(text.includes('red') ? red : yellow, player, team);
  }
}

function toRanked(map: Map<string, StatEntry>) {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, playerName: e.playerName, team: e.team, count: e.count }));
}

async function fetchESPNSummary(id: string): Promise<ESPNSummary | null> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) },
    );
    return res.ok ? (await res.json() as ESPNSummary) : null;
  } catch { return null; }
}

async function getESPNEventIdsForDate(dateStr: string): Promise<ESPNEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { events?: ESPNEvent[] };
    return data.events ?? [];
  } catch { return []; }
}

export async function GET() {
  const [{ matches }, playerStats] = await Promise.all([getWorldCupMatches(), getWorldCupPlayerStats()]);

  const finished = matches.filter(m => m.status === 'finished');

  // Collect ESPN event IDs: prefer stored espnEventId, fall back to date scoreboard lookup
  const eventIdsByDate = new Map<string, ESPNEvent[]>();
  const uniqueDates = [...new Set(finished.map(m => m.kickoff.slice(0, 10).replace(/-/g, '')))];
  const dateResults = await Promise.all(uniqueDates.map(d => getESPNEventIdsForDate(d)));
  uniqueDates.forEach((d, i) => eventIdsByDate.set(d, dateResults[i]));

  function word0(s: string) { return s.split(' ')[0].toLowerCase(); }
  function findEspnId(homeEn: string, awayEn: string, date: string): string | null {
    const events = eventIdsByDate.get(date) ?? [];
    const found = events.find(ev => {
      const names = (ev.competitions?.[0]?.competitors ?? []).map(c => (c.team?.displayName ?? '').toLowerCase());
      return names.some(n => n === homeEn.toLowerCase() || n.startsWith(word0(homeEn)) || homeEn.toLowerCase().startsWith(word0(n)))
          && names.some(n => n === awayEn.toLowerCase() || n.startsWith(word0(awayEn)) || awayEn.toLowerCase().startsWith(word0(n)));
    });
    return found?.id ?? null;
  }

  const espnIds = finished.map(m => {
    if (m.espnEventId) return m.espnEventId;
    const date = m.kickoff.slice(0, 10).replace(/-/g, '');
    return findEspnId(m.homeTeam.nameEn, m.awayTeam.nameEn, date);
  }).filter(Boolean) as string[];

  const summaries = await Promise.all([...new Set(espnIds)].map(fetchESPNSummary));

  const goals = new Map<string, StatEntry>();
  const assists = new Map<string, StatEntry>();
  const yellow = new Map<string, StatEntry>();
  const red = new Map<string, StatEntry>();

  for (const s of summaries) {
    if (s) parseSummary(s, goals, assists, yellow, red);
  }

  return NextResponse.json({
    success: true,
    goals: toRanked(goals),
    assists: toRanked(assists),
    yellowCards: toRanked(yellow),
    redCards: toRanked(red),
    playerStats,
  }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } });
}
