/**
 * SofaScore API client — server-side with browser-like headers.
 * Also exports types used by client-side code.
 */

import { teams } from '@/lib/world-cup/static-data';

const SOFA_BASE = 'https://api.sofascore.com/api/v1';
const WC_UNIQUE_TOURNAMENT_ID = 16;

export const SOFA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

// ---------- Types ----------

export type SofaTeamRef = { id: number; name: string; nameCode?: string };

export type SofaScore = { current: number; display: number };

export type SofaEvent = {
  id: number;
  homeTeam: SofaTeamRef;
  awayTeam: SofaTeamRef;
  homeScore?: SofaScore;
  awayScore?: SofaScore;
  status: { code: number; type: string; description: string };
  startTimestamp: number;
  tournament?: { uniqueTournament?: { id: number } };
};

export type SofaIncident = {
  id?: number;
  incidentType: string;
  incidentClass?: string;
  time: number;
  addedTime?: number;
  goalType?: string;
  player?: { id: number; name: string };
  assist1?: { id: number; name: string };
  playerIn?: { id: number; name: string };
  playerOut?: { id: number; name: string };
  team?: { id: number };
  homeScore?: number;
  awayScore?: number;
};

export type SofaLineupPlayer = {
  player: { id: number; name: string; jerseyNumber?: string };
  position: string;
  substitute: boolean;
};

export type SofaLineupTeam = {
  players: SofaLineupPlayer[];
  formation?: string;
};

export type SofaLineup = {
  home: SofaLineupTeam;
  away: SofaLineupTeam;
};

export type SofaTopScorer = {
  player: { id: number; name: string };
  team: { id: number; name: string; nameCode?: string };
  statistics: {
    goals: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
  };
};

export type MatchEvent = {
  type: string;
  minute: number;
  teamName: string;
  player: string;
  detail: string;
};

// ---------- Module-level cache for season ID ----------

let _cachedSeasonId: number | null = null;

// ---------- Generic fetch helper ----------

export async function sofaFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${SOFA_BASE}${path}`, {
      headers: SOFA_HEADERS,
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------- Season discovery ----------

export async function getWC2026SeasonId(): Promise<number | null> {
  if (_cachedSeasonId !== null) return _cachedSeasonId;
  const data = await sofaFetch<{ seasons: Array<{ id: number; year: string; name: string }> }>(
    `/unique-tournament/${WC_UNIQUE_TOURNAMENT_ID}/seasons`,
    3600,
  );
  if (!data?.seasons) return null;
  // Look for the 2026 season by year field
  const season =
    data.seasons.find(s => s.year === '2026') ??
    data.seasons.find(s => s.name?.includes('2026'));
  if (season) {
    _cachedSeasonId = season.id;
    return season.id;
  }
  return null;
}

// ---------- Team name helpers ----------

function word0(s: string): string {
  return s.split(' ')[0].toLowerCase();
}

function teamNameMatches(sofaName: string, queryName: string): boolean {
  const a = sofaName.toLowerCase();
  const b = queryName.toLowerCase();
  return (
    a === b ||
    a.startsWith(word0(b)) ||
    b.startsWith(word0(a)) ||
    word0(a) === word0(b)
  );
}

// ---------- Event ID discovery ----------

export async function findSofaEventId(
  homeEn: string,
  awayEn: string,
  dateISO: string,
): Promise<number | null> {
  const data = await sofaFetch<{ events: SofaEvent[] }>(
    `/sport/football/scheduled-events/${dateISO}`,
    60,
  );
  if (!data?.events) return null;

  const wc = data.events.filter(
    ev => ev.tournament?.uniqueTournament?.id === WC_UNIQUE_TOURNAMENT_ID,
  );

  for (const ev of wc) {
    if (
      teamNameMatches(ev.homeTeam.name, homeEn) &&
      teamNameMatches(ev.awayTeam.name, awayEn)
    ) {
      return ev.id;
    }
  }

  // Fallback: search all football events (in case tournament filter fails)
  for (const ev of data.events) {
    if (
      teamNameMatches(ev.homeTeam.name, homeEn) &&
      teamNameMatches(ev.awayTeam.name, awayEn)
    ) {
      return ev.id;
    }
  }

  return null;
}

// ---------- Incidents → MatchEvent[] ----------

function resolveTeamName(teamId: number, homeTeamId: number, awayTeamId: number, homeName: string, awayName: string): string {
  if (teamId === homeTeamId) return homeName;
  if (teamId === awayTeamId) return awayName;
  return '';
}

export async function getSofaIncidents(eventId: number): Promise<SofaIncident[] | null> {
  const data = await sofaFetch<{ incidents: SofaIncident[] }>(
    `/event/${eventId}/incidents`,
    30,
  );
  return data?.incidents ?? null;
}

export function parseSofaIncidents(
  incidents: SofaIncident[],
  homeTeamId: number,
  awayTeamId: number,
  homeName: string,
  awayName: string,
): MatchEvent[] {
  const events: MatchEvent[] = [];

  for (const inc of incidents) {
    const minute = inc.time ?? 0;
    const teamId = inc.team?.id;
    const teamName = teamId
      ? resolveTeamName(teamId, homeTeamId, awayTeamId, homeName, awayName)
      : '';

    switch (inc.incidentType) {
      case 'goal': {
        const type =
          inc.goalType === 'own' ? 'owngoal' : 'goal';
        const player = inc.player?.name ?? '';
        const assist = inc.assist1?.name ?? '';
        events.push({
          type,
          minute,
          teamName,
          player,
          detail: assist
            ? `בישול: ${assist}`
            : type === 'owngoal'
            ? 'שער עצמי'
            : '',
        });
        break;
      }
      case 'card': {
        const type =
          inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed'
            ? 'redcard'
            : 'yellowcard';
        events.push({
          type,
          minute,
          teamName,
          player: inc.player?.name ?? '',
          detail: '',
        });
        break;
      }
      case 'substitution': {
        events.push({
          type: 'substitution',
          minute,
          teamName,
          player: inc.playerIn?.name ?? '',
          detail: inc.playerOut?.name ? `יצא: ${inc.playerOut.name}` : '',
        });
        break;
      }
      default:
        break;
    }
  }

  // Sort newest first
  events.sort((a, b) => b.minute - a.minute);
  return events;
}

// ---------- Lineups ----------

export async function getSofaLineups(eventId: number): Promise<SofaLineup | null> {
  const data = await sofaFetch<SofaLineup>(`/event/${eventId}/lineups`, 60);
  return data ?? null;
}

// ---------- Top Scorers ----------

export async function getSofaTopScorers(seasonId: number): Promise<SofaTopScorer[] | null> {
  const data = await sofaFetch<{ topScorers: SofaTopScorer[] }>(
    `/unique-tournament/${WC_UNIQUE_TOURNAMENT_ID}/season/${seasonId}/top-scorers`,
    300,
  );
  return data?.topScorers ?? null;
}

// ---------- Resolve team from static data ----------

export function resolveStaticTeam(sofaName: string) {
  const name = sofaName.toLowerCase();
  return (
    Object.values(teams).find(
      t =>
        t.nameEn.toLowerCase() === name ||
        name.startsWith(word0(t.nameEn.toLowerCase())) ||
        t.nameEn.toLowerCase().startsWith(word0(name)),
    ) ?? null
  );
}
