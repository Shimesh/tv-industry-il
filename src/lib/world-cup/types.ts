export type WorldCupMatchStatus = 'scheduled' | 'live' | 'finished';

export type WorldCupTeam = {
  id: string;
  nameHe: string;
  nameEn: string;
  flag: string;
};

export type WorldCupMatch = {
  id: string;
  matchNumber: number;
  stage: 'group' | 'round_of_32' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final';
  group?: string;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  homeScore: number | null;
  awayScore: number | null;
  status: WorldCupMatchStatus;
  kickoff: string;
  venueId: string;
  broadcaster: 'kan11' | 'sport5' | 'tbd';
  minute?: number | null;
};

export type WorldCupStanding = {
  group: string;
  team: WorldCupTeam;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type WorldCupPlayerStat = {
  rank: number;
  playerName: string;
  team: WorldCupTeam;
  goals: number;
  assists: number;
  shots: number;
  minutes: number;
};

export type WorldCupVenue = {
  id: string;
  nameHe: string;
  nameEn: string;
  cityHe: string;
  cityEn: string;
  countryHe: string;
  capacity: number;
  latitude: number;
  longitude: number;
  imageUrl: string;
  factHe: string;
};

export type WorldCupWeather = {
  venueId: string;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  fetchedAt: string;
};

export type WorldCupNewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
  isSourceLogoFallback?: boolean;
};

export type WorldCupPlayer = {
  name: string;
  number?: number;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  club?: string;
  caps?: number;
  goals?: number;
};

export type WorldCupTournamentResult = {
  year: number;
  host: string;
  stage: string;
  notes?: string;
};

export type WorldCupTeamDetail = {
  id: string;
  nameHe: string;
  nameEn: string;
  flag: string;
  confederation: 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
  coachHe: string;
  coachEn: string;
  fifaRanking?: number;
  worldCupTitles: number;
  bestResult: string;
  squad: WorldCupPlayer[];
  tournamentHistory: WorldCupTournamentResult[];
  group?: string;
};

export type MatchLineupPlayer = {
  name: string;
  number: number;
  position: string;
  isStarter: boolean;
};

export type MatchDetail = {
  matchId: string;
  homeLineup: MatchLineupPlayer[];
  awayLineup: MatchLineupPlayer[];
  homeCoach: string;
  awayCoach: string;
  referee?: string;
  refereeCountry?: string;
  broadcastChannelHe?: string;
  broadcastTime?: string;
  attendance?: number;
};
