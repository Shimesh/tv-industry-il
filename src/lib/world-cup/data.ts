import { fallbackMatches, fallbackPlayerStats, fallbackStandings, teamDetails, teams, venues } from './static-data';
import type { WorldCupMatch, WorldCupPlayerStat, WorldCupStanding, WorldCupTeam, WorldCupVenue, WorldCupWeather } from './types';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

type FootballDataTeam = {
  id?: number;
  name?: string;
  tla?: string;
  crest?: string;
};

type FootballDataMatch = {
  id: number;
  matchday?: number;
  stage?: string;
  group?: string | null;
  utcDate: string;
  status: string;
  homeTeam?: FootballDataTeam;
  awayTeam?: FootballDataTeam;
  score?: {
    fullTime?: {
      home?: number | null;
      away?: number | null;
    };
  };
};

type FootballDataStandings = {
  standings?: Array<{
    group?: string;
    table?: Array<{
      team?: FootballDataTeam;
      playedGames?: number;
      won?: number;
      draw?: number;
      lost?: number;
      goalsFor?: number;
      goalsAgainst?: number;
      points?: number;
    }>;
  }>;
};

function normalizeTeam(input?: FootballDataTeam): WorldCupTeam {
  if (!input?.name) return teams.tbd;
  const tla = input.tla?.toLowerCase() || String(input.id || input.name).toLowerCase();
  const known = Object.values(teams).find((team) => team.nameEn.toLowerCase() === input.name?.toLowerCase() || team.id === tla);
  if (known) return known;
  return {
    id: tla,
    nameHe: input.name,
    nameEn: input.name,
    flag: input.crest ? '⚽' : '🏳️',
  };
}

function normalizeStatus(status: string): WorldCupMatch['status'] {
  if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(status)) return 'live';
  if (['FINISHED', 'AWARDED'].includes(status)) return 'finished';
  return 'scheduled';
}

function normalizeStage(stage?: string): WorldCupMatch['stage'] {
  if (!stage) return 'group';
  if (stage.includes('LAST_32')) return 'round_of_32';
  if (stage.includes('LAST_16')) return 'round_of_16';
  if (stage.includes('QUARTER')) return 'quarter_final';
  if (stage.includes('SEMI')) return 'semi_final';
  if (stage.includes('THIRD')) return 'third_place';
  if (stage.includes('FINAL')) return 'final';
  return 'group';
}

async function fetchFootballData<T>(path: string): Promise<T | null> {
  const token = process.env.FOOTBALL_DATA_API_TOKEN?.trim();
  if (!token) return null;

  const response = await fetch(`${FOOTBALL_DATA_BASE}${path}`, {
    headers: { 'X-Auth-Token': token },
    next: { revalidate: 60 },
  });

  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

// openfootball open data — free, no API key required, updated by community after games finish
type OpenFootballTeam = string | { name?: string; key?: string };
type OpenFootballMatch = {
  num?: number;
  date?: string;
  time?: string;
  team1?: OpenFootballTeam;
  team2?: OpenFootballTeam;
  score1?: number | null;
  score2?: number | null;
  group?: string;
  score?: { ft?: [number, number] };
};
type OpenFootballData = {
  rounds?: Array<{ name?: string; matches?: OpenFootballMatch[] }>;
  matches?: OpenFootballMatch[];
};

async function fetchOpenFootballData(): Promise<WorldCupMatch[] | null> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as OpenFootballData;

    const raw: OpenFootballMatch[] = [];
    if (data.rounds) data.rounds.forEach(r => raw.push(...(r.matches ?? [])));
    else if (data.matches) raw.push(...data.matches);
    if (!raw.length) return null;

    const staticByNum = new Map(fallbackMatches.map(m => [m.matchNumber, m]));

    function resolveTeam(t?: OpenFootballTeam): WorldCupTeam {
      const name = typeof t === 'string' ? t : (t?.name ?? '');
      const found = Object.values(teams).find(
        tm => tm.nameEn.toLowerCase() === name.toLowerCase() || tm.nameHe === name,
      );
      return found ?? teams.tbd;
    }

    return raw.map((m, i) => {
      const matchNum = m.num ?? i + 1;
      const base = staticByNum.get(matchNum);
      const score1 = m.score1 ?? m.score?.ft?.[0] ?? null;
      const score2 = m.score2 ?? m.score?.ft?.[1] ?? null;
      const finished = typeof score1 === 'number' && typeof score2 === 'number';
      return {
        id: base?.id ?? `of-${matchNum}`,
        matchNumber: matchNum,
        stage: base?.stage ?? 'group',
        group: base?.group,
        homeTeam: resolveTeam(m.team1) ?? base?.homeTeam ?? teams.tbd,
        awayTeam: resolveTeam(m.team2) ?? base?.awayTeam ?? teams.tbd,
        homeScore: score1,
        awayScore: score2,
        status: finished ? 'finished' : (base?.status ?? 'scheduled'),
        kickoff: base?.kickoff ?? '',
        venueId: base?.venueId ?? '',
        broadcaster: 'kan11' as const,
        minute: base?.minute,
      };
    });
  } catch {
    return null;
  }
}

export async function getWorldCupMatches(): Promise<{ matches: WorldCupMatch[]; source: 'football-data' | 'fallback'; updatedAt: string }> {
  const payload = await fetchFootballData<{ matches?: FootballDataMatch[] }>('/competitions/WC/matches?season=2026');
  const fdMatches = payload?.matches;

  if (!fdMatches?.length) {
    // Try openfootball as secondary free source (has scores after games finish)
    const openMatches = await fetchOpenFootballData();
    if (openMatches?.length) {
      return { matches: openMatches, source: 'fallback', updatedAt: new Date().toISOString() };
    }
    return { matches: fallbackMatches, source: 'fallback', updatedAt: new Date().toISOString() };
  }

  return {
    source: 'football-data',
    updatedAt: new Date().toISOString(),
    matches: fdMatches.map((match, index) => ({
      id: String(match.id),
      matchNumber: match.matchday ?? index + 1,
      stage: normalizeStage(match.stage),
      group: match.group?.replace(/^GROUP_/, '') || undefined,
      homeTeam: normalizeTeam(match.homeTeam),
      awayTeam: normalizeTeam(match.awayTeam),
      homeScore: match.score?.fullTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? null,
      status: normalizeStatus(match.status),
      kickoff: match.utcDate,
      venueId: fallbackMatches[index]?.venueId ?? venues[index % venues.length].id,
      broadcaster: 'kan11',
      minute: normalizeStatus(match.status) === 'live' ? null : undefined,
    })),
  };
}

export async function getWorldCupStandings(): Promise<{ standings: WorldCupStanding[]; source: 'football-data' | 'fallback' }> {
  const payload = await fetchFootballData<FootballDataStandings>('/competitions/WC/standings?season=2026');
  const raw = payload?.standings?.flatMap((group) =>
    (group.table ?? []).map((row) => {
      const teamObj = normalizeTeam(row.team);
      const staticGroup = teamDetails.find((t) => t.id === teamObj.id)?.group;
      return {
        group: group.group?.replace(/^GROUP_/, '') || staticGroup || 'A',
        team: teamObj,
        played: row.playedGames ?? 0,
        won: row.won ?? 0,
        drawn: row.draw ?? 0,
        lost: row.lost ?? 0,
        goalsFor: row.goalsFor ?? 0,
        goalsAgainst: row.goalsAgainst ?? 0,
        points: row.points ?? 0,
      };
    }),
  ) ?? [];

  if (!raw.length) return { standings: fallbackStandings, source: 'fallback' };

  // Merge live scores from API into fallback group structure so groups are always correct
  const liveMap = new Map(raw.map((s) => [s.team.id, s]));
  const merged = fallbackStandings.map((row) => {
    const live = liveMap.get(row.team.id);
    return live ? { ...row, played: live.played, won: live.won, drawn: live.drawn, lost: live.lost, goalsFor: live.goalsFor, goalsAgainst: live.goalsAgainst, points: live.points } : row;
  });

  return { standings: merged, source: 'football-data' };
}

export function getWorldCupVenues(): WorldCupVenue[] {
  return venues;
}

export function getWorldCupPlayerStats(): WorldCupPlayerStat[] {
  return fallbackPlayerStats;
}

export function getActiveWorldCupMatch(matches: WorldCupMatch[]): WorldCupMatch | null {
  return matches.find((match) => match.status === 'live') ?? null;
}

export async function getVenueWeather(venueId: string): Promise<WorldCupWeather | null> {
  const venue = venues.find((candidate) => candidate.id === venueId);
  if (!venue) return null;

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${venue.latitude}&longitude=${venue.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
    { next: { revalidate: 1800 } },
  );
  if (!response.ok) return null;
  const data = await response.json();
  const current = data?.current;
  return {
    venueId,
    temperature: typeof current?.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null,
    humidity: typeof current?.relative_humidity_2m === 'number' ? Math.round(current.relative_humidity_2m) : null,
    windSpeed: typeof current?.wind_speed_10m === 'number' ? Math.round(current.wind_speed_10m) : null,
    weatherCode: typeof current?.weather_code === 'number' ? current.weather_code : null,
    fetchedAt: new Date().toISOString(),
  };
}
