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

function isGenericKnockoutPlaceholder(team: WorldCupTeam): boolean {
  const value = `${team.id} ${team.nameEn}`.toLowerCase();
  return /\b(winner|loser|round of|quarter.?final|semi.?final|finalist|tbd|to be determined)\b/.test(value)
    || /^(rd|r16|qf|sf)[\s_-]*[wl]?\d+/.test(team.id.toLowerCase());
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

function resolveFinishedKnockoutParticipants(matches: WorldCupMatch[]): WorldCupMatch[] {
  const byNumber = new Map(matches.map((match) => [match.matchNumber, match]));

  const resolveReference = (team: WorldCupTeam): WorldCupTeam => {
    const reference = team.id.match(/^([wl])-?(\d+)$/i);
    if (!reference) return team;
    const source = byNumber.get(Number(reference[2]));
    if (!source || source.status !== 'finished' || source.homeScore == null || source.awayScore == null) return team;
    if (source.homeScore === source.awayScore) return team;
    const homeWon = source.homeScore > source.awayScore;
    if (reference[1].toLowerCase() === 'w') return homeWon ? source.homeTeam : source.awayTeam;
    return homeWon ? source.awayTeam : source.homeTeam;
  };

  return [...matches]
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((match) => {
      const homeTeam = resolveReference(match.homeTeam);
      const awayTeam = resolveReference(match.awayTeam);
      const resolved = homeTeam === match.homeTeam && awayTeam === match.awayTeam
        ? match
        : { ...match, homeTeam, awayTeam };
      byNumber.set(resolved.matchNumber, resolved);
      return resolved;
    });
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
  team?: { displayName?: string; abbreviation?: string; logo?: string };
  score?: string;
};

// football-data assigns its own chronological matchday sequence to several
// Round-of-32 fixtures. These stable source IDs map them back to FIFA's official
// match numbers, which drive the schedule and knockout bracket.
const FOOTBALL_DATA_CANONICAL_MATCH_NUMBERS: Record<number, number> = {
  537417: 73,
  537415: 74,
  537418: 75,
  537423: 76,
  537416: 77,
  537424: 78,
  537425: 79,
  537426: 80,
  537421: 81,
  537422: 82,
  537419: 83,
  537420: 84,
  537429: 85,
  537427: 86,
  537430: 87,
  537428: 88,
};

const MATCH_OVERRIDES: Record<number, Partial<WorldCupMatch>> = {
  // Mexico v England was delayed by one hour and finished 2-3.
  92: {
    kickoff: '2026-07-06T01:00:00.000Z',
    status: 'finished',
    homeScore: 2,
    awayScore: 3,
    espnEventId: '760505',
  },
};
type ESPNEvent = {
  id?: string;
  date?: string;
  status?: {
    type?: { name?: string; completed?: boolean; shortDetail?: string };
  };
  competitions?: Array<{ competitors?: ESPNCompetitor[] }>;
};

async function fetchESPNScoreboard(): Promise<ESPNEvent[] | null> {
  try {
    // Fetch live scoreboard + date-based queries to capture recently completed matches
    const dateKey = (offsetDays: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offsetDays);
      return date.toISOString().slice(0, 10).replace(/-/g, '');
    };
    const urls = [
      ...[-1, 0, 1].map((offset) =>
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateKey(offset)}&limit=100`,
      ),
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719',
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

// Canonical nameEn → alternative names used by ESPN / OpenFootball
const ESPN_TEAM_ALIASES: Record<string, string[]> = {
  "côte d'ivoire": ['ivory coast', "cote d'ivoire"],
  'türkiye': ['turkey'],
  'bosnia and herzegovina': ['bosnia & herzegovina', 'bosnia-herzegovina'],
  'south korea': ['korea republic', 'korea'],
  'north korea': ['korea dpr'],
  'iran': ['ir iran'],
  'china': ['china pr'],
  'czechia': ['czech republic'],
  'united states': ['usa', 'united states of america'],
};

function espnNormalize(name: string): string {
  const n = name.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(ESPN_TEAM_ALIASES)) {
    if (n === canonical || aliases.includes(n)) return canonical;
  }
  return n;
}

function applyESPNOverlay(matches: WorldCupMatch[], espnEvents: ESPNEvent[]): WorldCupMatch[] {
  return matches.map(match => {
    const homeEn = espnNormalize(match.homeTeam.nameEn);
    const awayEn = espnNormalize(match.awayTeam.nameEn);

    const matchingByTeams = espnEvents.find(ev => {
      if (!ev.date || !match.kickoff || Math.abs(Date.parse(ev.date) - Date.parse(match.kickoff)) > 12 * 60 * 60_000) return false;
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const names = comps.map(c => espnNormalize(c.team?.displayName ?? ''));
      return names.includes(homeEn) && names.includes(awayEn);
    });
    const matchingByKickoff = espnEvents.filter((event) => {
      if (!event.date || !match.kickoff) return false;
      return Math.abs(Date.parse(event.date) - Date.parse(match.kickoff)) <= 60_000;
    });
    const espn = matchingByTeams ?? (matchingByKickoff.length === 1 ? matchingByKickoff[0] : undefined);
    if (!espn) return match;

    const statusName = espn.status?.type?.name ?? '';
    const isCompleted = espn.status?.type?.completed === true;
    const effectiveKickoff = espn.date ?? match.kickoff;
    const kickoffMs = effectiveKickoff ? Date.parse(effectiveKickoff) : 0;
    const kickoffInFuture = kickoffMs > 0 && kickoffMs > Date.now();
    let status: WorldCupMatch['status'] = match.status;
    if (!kickoffInFuture) {
      if ([
        'STATUS_IN_PROGRESS',
        'STATUS_FIRST_HALF',
        'STATUS_HALFTIME',
        'STATUS_SECOND_HALF',
        'STATUS_EXTRA_TIME',
        'STATUS_PENALTY_SHOOTOUT',
      ].includes(statusName)) status = 'live';
      else if (isCompleted || ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_AWARDED', 'STATUS_POSTPONED'].includes(statusName)) status = 'finished';
      else if (statusName === 'STATUS_SCHEDULED' || statusName === 'STATUS_PRE') status = 'scheduled';
    } else {
      // Kickoff still in the future — ESPN sometimes pre-populates scores; ignore them
      status = 'scheduled';
    }

    const comps = espn.competitions?.[0]?.competitors ?? [];
    const matchedHomeComp = comps.find(c => {
      const n = espnNormalize(c.team?.displayName ?? '');
      return n === homeEn;
    });
    const homeComp = comps.find(c => c.homeAway === 'home') ?? matchedHomeComp;
    const awayComp = comps.find(c => c.homeAway === 'away') ?? comps.find(c => c !== homeComp);

    const espnTeam = (competitor: ESPNCompetitor | undefined, fallback: WorldCupTeam): WorldCupTeam => {
      if (!competitor?.team?.displayName) return fallback;
      const normalized = normalizeTeam({
        name: competitor.team.displayName,
        tla: competitor.team.abbreviation,
        crest: competitor.team.logo,
      });
      return normalized.id === 'tbd' || isGenericKnockoutPlaceholder(normalized) ? fallback : normalized;
    };

    const homeScore = homeComp?.score != null ? parseInt(homeComp.score, 10) : null;
    const awayScore = awayComp?.score != null ? parseInt(awayComp.score, 10) : null;

    // Parse minute from ESPN shortDetail, e.g. "87'" → 87, "45+2'" → 45 + label "45+2", "Pen." → label "פנדלים"
    const shortDetail = espn.status?.type?.shortDetail ?? '';
    const minuteMatch = shortDetail.match(/^(\d+)(\+(\d+))?/);
    const baseMin = minuteMatch ? parseInt(minuteMatch[1], 10) : (status === 'live' ? match.minute : undefined);
    const addedMin = minuteMatch?.[3] ? parseInt(minuteMatch[3], 10) : undefined;
    const isPenShootout = /^pen/i.test(shortDetail);
    const isET = /^et\b/i.test(shortDetail);
    const minuteLabel: string | null = isPenShootout
      ? 'פנדלים'
      : isET && baseMin != null
      ? `הארכה ${baseMin}`
      : addedMin != null
      ? `${minuteMatch![1]}+${addedMin}`
      : null;
    const minute = baseMin;

    return {
      ...match,
      homeTeam: espnTeam(homeComp, match.homeTeam),
      awayTeam: espnTeam(awayComp, match.awayTeam),
      kickoff: effectiveKickoff,
      status,
      homeScore: !kickoffInFuture && homeScore != null && !isNaN(homeScore) ? homeScore : match.homeScore,
      awayScore: !kickoffInFuture && awayScore != null && !isNaN(awayScore) ? awayScore : match.awayScore,
      minute: !kickoffInFuture ? (minute ?? match.minute) : undefined,
      minuteLabel: !kickoffInFuture ? (minuteLabel ?? match.minuteLabel) : null,
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
  score?: { ft?: [number, number]; ht?: [number, number] };
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

    // Build team-name keyed lookup (OF sorts by group, not date — matchNumber unreliable)
    const ofNameAliases: Record<string, string> = {
      'czech republic': 'czechia',
      'usa': 'united states',
      'ivory coast': "côte d'ivoire",
      "cote d'ivoire": "côte d'ivoire",
      'turkey': 'türkiye',
      'bosnia & herzegovina': 'bosnia and herzegovina',
      'korea republic': 'south korea',
      'korea dpr': 'north korea',
      'ir iran': 'iran',
      'china pr': 'china',
    };

    function resolveTeam(t?: OpenFootballTeam): WorldCupTeam | null {
      const rawName = typeof t === 'string' ? t : (t?.name ?? '');
      if (!rawName) return null;
      const nameNorm = ofNameAliases[rawName.toLowerCase()] ?? rawName.toLowerCase();
      const found = Object.values(teams).find(tm => {
        const en = tm.nameEn.toLowerCase();
        return en === nameNorm || en === rawName.toLowerCase() || tm.nameHe === rawName;
      });
      return found ?? null;
    }

    const teamKey = (a: string, b: string) => [a.toLowerCase(), b.toLowerCase()].sort().join('||');
    const staticByTeamKey = new Map(
      fallbackMatches.map(m => [teamKey(m.homeTeam.nameEn, m.awayTeam.nameEn), m]),
    );
    const staticByNum = new Map(fallbackMatches.map(m => [m.matchNumber, m]));

    return raw.map((m, i) => {
      const resolvedHome = resolveTeam(m.team1);
      const resolvedAway = resolveTeam(m.team2);
      const base = (resolvedHome && resolvedAway
        ? staticByTeamKey.get(teamKey(resolvedHome.nameEn, resolvedAway.nameEn))
        : undefined) ?? staticByNum.get(m.num ?? i + 1);
      const matchNum = base?.matchNumber ?? m.num ?? i + 1;
      const score1 = m.score1 ?? m.score?.ft?.[0] ?? null;
      const score2 = m.score2 ?? m.score?.ft?.[1] ?? null;
      const finished = typeof score1 === 'number' && typeof score2 === 'number';
      return {
        id: base?.id ?? `of-${matchNum}`,
        matchNumber: matchNum,
        stage: base?.stage ?? 'group',
        group: base?.group,
        homeTeam: resolvedHome ?? base?.homeTeam ?? teams.tbd,
        awayTeam: resolvedAway ?? base?.awayTeam ?? teams.tbd,
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
    const nowMs = Date.now();
    matches = fdMatches.map((match, index) => {
      const normalizedHome = normalizeTeam(match.homeTeam);
      const normalizedAway = normalizeTeam(match.awayTeam);
      // football-data's `matchday` is the chronological tournament sequence,
      // not FIFA's official match number. Knockout games played on the same day
      // can therefore be numbered differently. Prefer the canonical team pairing.
      const baseByTeams = normalizedHome.id !== 'tbd' && normalizedAway.id !== 'tbd'
        ? fallbackMatches.find((candidate) =>
            candidate.homeTeam.id === normalizedHome.id && candidate.awayTeam.id === normalizedAway.id)
        : undefined;
      const reportedMatchNumber = FOOTBALL_DATA_CANONICAL_MATCH_NUMBERS[match.id]
        ?? match.matchday
        ?? index + 1;
      const base = baseByTeams
        ?? fallbackMatches.find((candidate) => candidate.matchNumber === reportedMatchNumber)
        ?? fallbackMatches[index];
      const matchNumber = base?.matchNumber ?? reportedMatchNumber;
      const kickoffMs = match.utcDate ? Date.parse(match.utcDate) : 0;
      const kickoffInFuture = kickoffMs > nowMs;
      // Never mark a match as finished/live if its kickoff is still in the future —
      // some FD environments pre-populate scores for future matches
      const rawStatus = normalizeStatus(match.status);
      const status = kickoffInFuture ? 'scheduled' : rawStatus;
      return {
        id: String(match.id),
        matchNumber,
        stage: base?.stage ?? normalizeStage(match.stage),
        group: match.group?.replace(/^GROUP_/, '') || undefined,
        homeTeam: (normalizedHome.id === 'tbd' || isGenericKnockoutPlaceholder(normalizedHome)) && base?.homeTeam.id !== 'tbd'
          ? base.homeTeam
          : normalizedHome,
        awayTeam: (normalizedAway.id === 'tbd' || isGenericKnockoutPlaceholder(normalizedAway)) && base?.awayTeam.id !== 'tbd'
          ? base.awayTeam
          : normalizedAway,
        homeScore: status !== 'scheduled' ? (match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null) : null,
        awayScore: status !== 'scheduled' ? (match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null) : null,
        status,
        kickoff: match.utcDate,
        venueId: base?.venueId ?? venues[index % venues.length].id,
        broadcaster: 'kan11',
        minute: status === 'live' ? null : undefined,
      };
    });
  }

  // Overlay live scores & status from ESPN (handles cases where football-data.org
  // has stale status/scores — ESPN free scoreboard is real-time for WC matches)
  if (espnEvents?.length) {
    matches = applyESPNOverlay(matches, espnEvents);
  }

  const now = Date.now();
  // Supplement with openfootball for:
  // 1. matches still 'scheduled' but kickoff >105 min ago (ESPN missed them)
  // 2. matches stuck as 'live' but kickoff >120 min ago (ESPN stopped reporting)
  const needsScore = matches.some(m => {
    if (!m.kickoff) return false;
    const elapsed = now - Date.parse(m.kickoff);
    return (m.status === 'scheduled' && elapsed > 105 * 60_000) ||
           (m.status === 'live'      && elapsed > 120 * 60_000);
  });
  if (needsScore) {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
        { cache: 'no-store' },
      );
      if (res.ok) {
        const data = await res.json() as { rounds?: Array<{ matches?: OpenFootballMatch[] }>; matches?: OpenFootballMatch[] };
        const raw: OpenFootballMatch[] = [];
        if (data.rounds) data.rounds.forEach(r => raw.push(...(r.matches ?? [])));
        else if (data.matches) raw.push(...(data.matches as OpenFootballMatch[]));

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
          if (m.status !== 'scheduled' && m.status !== 'live') return m;
          if (!m.kickoff) return m;
          const elapsed = now - Date.parse(m.kickoff);
          if (m.status === 'scheduled' && elapsed <= 105 * 60_000) return m;
          if (m.status === 'live'      && elapsed <= 120 * 60_000) return m;
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

  matches = matches.map((match) => {
    const override = MATCH_OVERRIDES[match.matchNumber];
    return override ? { ...match, ...override } : match;
  });
  matches = resolveFinishedKnockoutParticipants(matches);

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

    const aliases: Record<string, string> = {
      'czech republic': 'czechia', 'usa': 'united states', 'ivory coast': "côte d'ivoire",
      'turkey': 'türkiye', 'bosnia & herzegovina': 'bosnia and herzegovina',
      'korea republic': 'south korea', 'ir iran': 'iran', 'china pr': 'china',
    };

    function findTeam(teamName: string | undefined): WorldCupTeam {
      if (!teamName) return teams.tbd;
      const n = aliases[teamName.toLowerCase()] ?? teamName.toLowerCase();
      return Object.values(teams).find(t => t.nameEn.toLowerCase() === n || t.nameEn.toLowerCase() === teamName.toLowerCase())
        ?? { id: 'tbd', nameHe: teamName, nameEn: teamName, flag: '🏳️' };
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
