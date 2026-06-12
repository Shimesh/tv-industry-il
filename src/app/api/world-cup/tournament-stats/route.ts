import { NextResponse } from 'next/server';
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
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) },
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
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) },
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
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(7000) },
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
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) },
    );
    return res.ok ? (await res.json() as ESPNSummary) : null;
  } catch { return null; }
}

export async function GET() {
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

  for (const s of summaries) {
    if (s) parseSummary(s, goals, assists, yellow, red);
  }

  return NextResponse.json({
    success: true,
    goals: toRanked(goals),
    assists: toRanked(assists),
    yellowCards: toRanked(yellow),
    redCards: toRanked(red),
  }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } });
}
