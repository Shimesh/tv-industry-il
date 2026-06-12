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
    halfTime?: {
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

// ESPN unofficial scoreboard — free, no key needed, reliable live WC scores
type ESPNCompetitor = {
  homeAway?: string;
  team?: { displayName?: string; abbreviation?: string };
  score?: string;
};
type ESPNEvent = {
  id?: string;
  status?: {
    type?: { name?: string; completed?: boolean; shortDetail?: string };
  };
  competitions?: Array<{ competitors?: ESPNCompetitor[] }>;
};

async function fetchESPNScoreboard(): Promise<ESPNEvent[] | null> {
  try {
    // Fetch live scoreboard + date-based queries to capture recently completed matches
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    const wcStart = '20260611';
    const urls = [
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${today}`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${yesterday}`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${wcStart}-${today}`,
    ];
    const results = await Promise.all(
      urls.map(url => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() as Promise<{ events?: unknown[] }> : null)
        .catch(() => null)),
    );
    const seen = new Set<string>();
    const events: ESPNEvent[] = [];
    for (const data of results) {
      if (!Array.isArray(data?.events)) continue;
      for (const ev of data.events as ESPNEvent[]) {
        if (ev.id && !seen.has(ev.id)) { seen.add(ev.id); events.push(ev); }
        else if (!ev.id) events.push(ev);
      }
    }
    return events.length ? events : null;
  } catch {
    return null;
  }
}

function applyESPNOverlay(matches: WorldCupMatch[], espnEvents: ESPNEvent[]): WorldCupMatch[] {
  return matches.map(match => {
    const homeEn = match.homeTeam.nameEn.toLowerCase();
    const awayEn = match.awayTeam.nameEn.toLowerCase();

    const espn = espnEvents.find(ev => {
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const names = comps.map(c => (c.team?.displayName ?? '').toLowerCase());
      const word0 = (s: string) => s.split(' ')[0];
      const hasHome = names.some(n => n && (n === homeEn || n.startsWith(word0(homeEn)) || homeEn.startsWith(word0(n))));
      const hasAway = names.some(n => n && (n === awayEn || n.startsWith(word0(awayEn)) || awayEn.startsWith(word0(n))));
      return hasHome && hasAway;
    });
    if (!espn) return match;

    const statusName = espn.status?.type?.name ?? '';
    let status: WorldCupMatch['status'] = match.status;
    if (statusName === 'STATUS_IN_PROGRESS' || statusName === 'STATUS_HALFTIME') status = 'live';
    else if (statusName === 'STATUS_FINAL') status = 'finished';
    else if (statusName === 'STATUS_SCHEDULED') status = 'scheduled';

    const comps = espn.competitions?.[0]?.competitors ?? [];
    const word0 = (s: string) => s.split(' ')[0];
    const homeComp = comps.find(c => {
      const n = (c.team?.displayName ?? '').toLowerCase();
      return n === homeEn || n.startsWith(word0(homeEn)) || homeEn.startsWith(word0(n));
    });
    const awayComp = comps.find(c => c !== homeComp);

    const homeScore = homeComp?.score != null ? parseInt(homeComp.score, 10) : null;
    const awayScore = awayComp?.score != null ? parseInt(awayComp.score, 10) : null;

    // Parse minute from ESPN shortDetail, e.g. "87'" → 87, "HT" → null
    const shortDetail = espn.status?.type?.shortDetail ?? '';
    const minuteMatch = shortDetail.match(/^(\d+)/);
    const minute = minuteMatch ? parseInt(minuteMatch[1], 10) : (status === 'live' ? match.minute : undefined);

    return {
      ...match,
      status,
      homeScore: (homeScore != null && !isNaN(homeScore)) ? homeScore : match.homeScore,
      awayScore: (awayScore != null && !isNaN(awayScore)) ? awayScore : match.awayScore,
      minute: minute ?? match.minute,
      espnEventId: espn.id ?? match.espnEventId,
    };
  });
}

// openfootball open data — free, no API key required, updated by community after games finish
type OpenFootballTeam = string | { name?: string; key?: string };
type OpenFootballGoal = { name?: string; minute?: string; type?: string };
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
  goals1?: OpenFootballGoal[];
  goals2?: OpenFootballGoal[];
  round?: string;
  ground?: string;
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
  // Fetch football-data.org and ESPN scoreboard in parallel
  const [payload, espnEvents] = await Promise.all([
    fetchFootballData<{ matches?: FootballDataMatch[] }>('/competitions/WC/matches?season=2026'),
    fetchESPNScoreboard(),
  ]);

  const fdMatches = payload?.matches;
  let matches: WorldCupMatch[];
  let source: 'football-data' | 'fallback';

  if (!fdMatches?.length) {
    // Try openfootball as secondary free source (has scores after games finish)
    const openMatches = await fetchOpenFootballData();
    matches = openMatches?.length ? openMatches : fallbackMatches;
    source = 'fallback';
  } else {
    source = 'football-data';
    matches = fdMatches.map((match, index) => ({
      id: String(match.id),
      matchNumber: match.matchday ?? index + 1,
      stage: normalizeStage(match.stage),
      group: match.group?.replace(/^GROUP_/, '') || undefined,
      homeTeam: normalizeTeam(match.homeTeam),
      awayTeam: normalizeTeam(match.awayTeam),
      homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
      status: normalizeStatus(match.status),
      kickoff: match.utcDate,
      venueId: fallbackMatches[index]?.venueId ?? venues[index % venues.length].id,
      broadcaster: 'kan11',
      minute: normalizeStatus(match.status) === 'live' ? null : undefined,
    }));
  }

  // Overlay live scores & status from ESPN (handles cases where football-data.org
  // has stale status/scores — ESPN free scoreboard is real-time for WC matches)
  if (espnEvents?.length) {
    matches = applyESPNOverlay(matches, espnEvents);
  }

  // Supplement with openfootball for matches whose kickoff has passed but still show 'scheduled'.
  // This catches completed matches that ESPN scoreboard no longer includes (hours after game ends).
  const now = Date.now();
  const needsScore = matches.some(
    m => m.status === 'scheduled' && m.kickoff && now - Date.parse(m.kickoff) > 105 * 60_000,
  );
  if (needsScore) {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
        { next: { revalidate: 120 } },
      );
      if (res.ok) {
        const data = await res.json() as { rounds?: Array<{ matches?: OpenFootballMatch[] }>; matches?: OpenFootballMatch[] };
        const raw: OpenFootballMatch[] = [];
        if (data.rounds) data.rounds.forEach(r => raw.push(...(r.matches ?? [])));
        else if (data.matches) raw.push(...(data.matches as OpenFootballMatch[]));

        // Build lookup by team name for finished matches (team name is reliable; matchNumber from FD uses matchday round, not sequential)
        const word0 = (s: string) => s.split(' ')[0].toLowerCase();
        function teamOf(t: OpenFootballTeam | undefined): string {
          return typeof t === 'string' ? t.toLowerCase() : (t?.name ?? '').toLowerCase();
        }
        function namesMatch(ofName: string, ourName: string): boolean {
          const a = ofName.toLowerCase();
          const b = ourName.toLowerCase();
          return a === b || a.startsWith(word0(b)) || b.startsWith(word0(a));
        }

        const finishedOf = raw.filter(m => {
          const s1 = m.score1 ?? m.score?.ft?.[0];
          const s2 = m.score2 ?? m.score?.ft?.[1];
          return typeof s1 === 'number' && typeof s2 === 'number';
        });

        matches = matches.map(m => {
          if (m.status !== 'scheduled') return m;
          if (!m.kickoff || now - Date.parse(m.kickoff) <= 105 * 60_000) return m;
          const ofMatch = finishedOf.find(of =>
            namesMatch(teamOf(of.team1), m.homeTeam.nameEn) &&
            namesMatch(teamOf(of.team2), m.awayTeam.nameEn),
          );
          if (!ofMatch) return m;
          const s1 = ofMatch.score1 ?? ofMatch.score?.ft?.[0];
          const s2 = ofMatch.score2 ?? ofMatch.score?.ft?.[1];
          if (typeof s1 !== 'number' || typeof s2 !== 'number') return m;
          return { ...m, status: 'finished' as const, homeScore: s1, awayScore: s2 };
        });
      }
    } catch { /* ignore, use current status */ }
  }

  return { matches, source, updatedAt: new Date().toISOString() };
}

type ESPNStandingEntry = {
  team?: { displayName?: string; abbreviation?: string };
  stats?: Array<{ name?: string; value?: number }>;
  note?: { color?: string; description?: string };
};
type ESPNStandingGroup = {
  header?: string;
  standings?: { entries?: ESPNStandingEntry[] };
  entries?: ESPNStandingEntry[];
};

async function fetchESPNStandings(): Promise<WorldCupStanding[] | null> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/standings',
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { groups?: ESPNStandingGroup[]; children?: ESPNStandingGroup[] };
    const groups: ESPNStandingGroup[] = data.groups ?? data.children ?? [];
    if (!groups.length) return null;

    const result: WorldCupStanding[] = [];
    for (const group of groups) {
      const header = group.header ?? '';
      // ESPN header format: "Group A" or "A"
      const groupLetter = header.replace(/^Group\s*/i, '').trim().toUpperCase() || 'A';
      const entries = group.standings?.entries ?? group.entries ?? [];
      for (const entry of entries) {
        const displayName = entry.team?.displayName ?? '';
        const found = Object.values(teams).find(
          t => t.nameEn.toLowerCase() === displayName.toLowerCase() ||
               (entry.team?.abbreviation && t.id === entry.team.abbreviation.toLowerCase()),
        );
        if (!found) continue;
        const stat = (name: string) => entry.stats?.find(s => s.name === name)?.value ?? 0;
        result.push({
          group: groupLetter,
          team: found,
          played: stat('gamesPlayed'),
          won: stat('wins'),
          drawn: stat('ties'),
          lost: stat('losses'),
          goalsFor: stat('pointsFor'),
          goalsAgainst: stat('pointsAgainst'),
          points: stat('points'),
        });
      }
    }
    return result.length ? result : null;
  } catch {
    return null;
  }
}

export async function getWorldCupStandings(): Promise<{ standings: WorldCupStanding[]; source: 'football-data' | 'fallback' }> {
  const [payload, espnStandings] = await Promise.all([
    fetchFootballData<FootballDataStandings>('/competitions/WC/standings?season=2026'),
    fetchESPNStandings(),
  ]);

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

  // Merge ALL sources — for each team, take the entry with the most played games.
  // This handles partial API responses (e.g. ESPN updates only some teams).
  const allEntries = [...(espnStandings ?? []), ...(raw.length ? raw : [])];
  if (!allEntries.length) return { standings: fallbackStandings, source: 'fallback' };

  const bestByTeam = new Map<string, WorldCupStanding>();
  for (const s of allEntries) {
    const existing = bestByTeam.get(s.team.id);
    if (!existing || s.played > existing.played) bestByTeam.set(s.team.id, s);
  }
  const merged = fallbackStandings.map((row) => {
    const best = bestByTeam.get(row.team.id);
    return best
      ? { ...row, played: best.played, won: best.won, drawn: best.drawn, lost: best.lost, goalsFor: best.goalsFor, goalsAgainst: best.goalsAgainst, points: best.points }
      : row;
  });

  return { standings: merged, source: 'football-data' };
}

export function deriveStandingsFromMatches(finishedMatches: WorldCupMatch[]): WorldCupStanding[] {
  const statsMap = new Map<string, WorldCupStanding>();
  for (const row of fallbackStandings) {
    statsMap.set(row.team.id, { ...row, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
  }
  for (const match of finishedMatches) {
    if (match.homeScore == null || match.awayScore == null) continue;
    const homeEntry = statsMap.get(match.homeTeam.id);
    const awayEntry = statsMap.get(match.awayTeam.id);
    if (!homeEntry || !awayEntry) continue;
    homeEntry.played++; awayEntry.played++;
    homeEntry.goalsFor += match.homeScore; homeEntry.goalsAgainst += match.awayScore;
    awayEntry.goalsFor += match.awayScore; awayEntry.goalsAgainst += match.homeScore;
    if (match.homeScore > match.awayScore) { homeEntry.won++; homeEntry.points += 3; awayEntry.lost++; }
    else if (match.homeScore < match.awayScore) { awayEntry.won++; awayEntry.points += 3; homeEntry.lost++; }
    else { homeEntry.drawn++; homeEntry.points++; awayEntry.drawn++; awayEntry.points++; }
  }
  return Array.from(statsMap.values());
}

export function getWorldCupVenues(): WorldCupVenue[] {
  return venues;
}

async function getPlayerStatsFromOpenFootball(): Promise<WorldCupPlayerStat[] | null> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rounds?: Array<{ matches?: OpenFootballMatch[] }>; matches?: OpenFootballMatch[] };
    const raw: OpenFootballMatch[] = [];
    if (data.rounds) data.rounds.forEach(r => raw.push(...(r.matches ?? [])));
    else if (data.matches) raw.push(...(data.matches as OpenFootballMatch[]));
    if (!raw.length) return null;

    type GoalEntry = { goals: number; team: WorldCupTeam };
    const playerMap = new Map<string, GoalEntry>();

    function word0(s: string) { return s.split(' ')[0].toLowerCase(); }

    function findTeam(teamName: string | undefined): WorldCupTeam {
      if (!teamName) return teams.tbd;
      const n = teamName.toLowerCase();
      return Object.values(teams).find(t =>
        t.nameEn.toLowerCase() === n ||
        t.nameEn.toLowerCase().startsWith(word0(n)) ||
        n.startsWith(word0(t.nameEn.toLowerCase())),
      ) ?? { id: 'tbd', nameHe: teamName, nameEn: teamName, flag: '🏳️' };
    }

    for (const m of raw) {
      const team1 = typeof m.team1 === 'string' ? m.team1 : m.team1?.name;
      const team2 = typeof m.team2 === 'string' ? m.team2 : m.team2?.name;
      const score1 = m.score1 ?? m.score?.ft?.[0];
      const score2 = m.score2 ?? m.score?.ft?.[1];
      if (typeof score1 !== 'number' || typeof score2 !== 'number') continue;

      for (const g of m.goals1 ?? []) {
        if (!g.name || (g.type ?? '').toLowerCase().includes('own')) continue;
        const prev = playerMap.get(g.name) ?? { goals: 0, team: findTeam(team1) };
        playerMap.set(g.name, { ...prev, goals: prev.goals + 1 });
      }
      for (const g of m.goals2 ?? []) {
        if (!g.name || (g.type ?? '').toLowerCase().includes('own')) continue;
        const prev = playerMap.get(g.name) ?? { goals: 0, team: findTeam(team2) };
        playerMap.set(g.name, { ...prev, goals: prev.goals + 1 });
      }
    }

    if (!playerMap.size) return null;

    return Array.from(playerMap.entries())
      .sort((a, b) => b[1].goals - a[1].goals)
      .map(([name, entry], i) => ({
        rank: i + 1,
        playerName: name,
        team: entry.team,
        goals: entry.goals,
        assists: 0,
        shots: 0,
        minutes: 0,
      }));
  } catch {
    return null;
  }
}

export async function getWorldCupPlayerStats(): Promise<WorldCupPlayerStat[]> {
  const payload = await fetchFootballData<{
    scorers?: Array<{
      player?: { name?: string };
      team?: { tla?: string; name?: string; crest?: string };
      goals?: number;
      assists?: number;
    }>;
  }>('/competitions/WC/scorers?season=2026&limit=10');

  if (payload?.scorers?.length) {
    return payload.scorers.map((s, i) => {
      const teamObj = normalizeTeam(s.team);
      return {
        rank: i + 1,
        playerName: s.player?.name ?? '—',
        team: teamObj,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        shots: 0,
        minutes: 0,
      };
    });
  }

  // FD has no scorer data — aggregate from OpenFootball (free, always accessible)
  const ofStats = await getPlayerStatsFromOpenFootball();
  return ofStats ?? fallbackPlayerStats;
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
