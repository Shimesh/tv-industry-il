import type { WorldCupMatch, WorldCupPlayerStat, WorldCupStanding, WorldCupTeam, WorldCupVenue } from './types';

export const WORLD_CUP_START_ISO = '2026-06-11T22:00:00.000Z';

export const teams: Record<string, WorldCupTeam> = {
  mex: { id: 'mex', nameHe: 'מקסיקו', nameEn: 'Mexico', flag: '🇲🇽' },
  rsa: { id: 'rsa', nameHe: 'דרום אפריקה', nameEn: 'South Africa', flag: '🇿🇦' },
  can: { id: 'can', nameHe: 'קנדה', nameEn: 'Canada', flag: '🇨🇦' },
  qat: { id: 'qat', nameHe: 'קטאר', nameEn: 'Qatar', flag: '🇶🇦' },
  usa: { id: 'usa', nameHe: 'ארצות הברית', nameEn: 'United States', flag: '🇺🇸' },
  par: { id: 'par', nameHe: 'פרגוואי', nameEn: 'Paraguay', flag: '🇵🇾' },
  bra: { id: 'bra', nameHe: 'ברזיל', nameEn: 'Brazil', flag: '🇧🇷' },
  mar: { id: 'mar', nameHe: 'מרוקו', nameEn: 'Morocco', flag: '🇲🇦' },
  arg: { id: 'arg', nameHe: 'ארגנטינה', nameEn: 'Argentina', flag: '🇦🇷' },
  alg: { id: 'alg', nameHe: 'אלג׳יריה', nameEn: 'Algeria', flag: '🇩🇿' },
  ger: { id: 'ger', nameHe: 'גרמניה', nameEn: 'Germany', flag: '🇩🇪' },
  nzl: { id: 'nzl', nameHe: 'ניו זילנד', nameEn: 'New Zealand', flag: '🇳🇿' },
  eng: { id: 'eng', nameHe: 'אנגליה', nameEn: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  cro: { id: 'cro', nameHe: 'קרואטיה', nameEn: 'Croatia', flag: '🇭🇷' },
  esp: { id: 'esp', nameHe: 'ספרד', nameEn: 'Spain', flag: '🇪🇸' },
  jpn: { id: 'jpn', nameHe: 'יפן', nameEn: 'Japan', flag: '🇯🇵' },
  tbd: { id: 'tbd', nameHe: 'ייקבע בהמשך', nameEn: 'TBD', flag: '🏳️' },
};

export const venues: WorldCupVenue[] = [
  { id: 'mexico-city', nameHe: 'אצטדיון מקסיקו סיטי', nameEn: 'Mexico City Stadium', cityHe: 'מקסיקו סיטי', cityEn: 'Mexico City', countryHe: 'מקסיקו', capacity: 83000, latitude: 19.3029, longitude: -99.1505, imageUrl: 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=1200&q=80', factHe: 'האצטדיון היחיד שיארח משחק פתיחה שלישי במונדיאל.' },
  { id: 'guadalajara', nameHe: 'אצטדיון גוודלחרה', nameEn: 'Guadalajara Stadium', cityHe: 'גוודלחרה', cityEn: 'Guadalajara', countryHe: 'מקסיקו', capacity: 48000, latitude: 20.6818, longitude: -103.4621, imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80', factHe: 'בית מודרני עם גג טבעתי שמבליט את קו הרקיע המקומי.' },
  { id: 'monterrey', nameHe: 'אצטדיון מונטריי', nameEn: 'Monterrey Stadium', cityHe: 'מונטריי', cityEn: 'Monterrey', countryHe: 'מקסיקו', capacity: 53500, latitude: 25.6689, longitude: -100.2449, imageUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80', factHe: 'חזית זכוכית דרמטית מול רכסי ההרים של נואבו לאון.' },
  { id: 'toronto', nameHe: 'אצטדיון טורונטו', nameEn: 'Toronto Stadium', cityHe: 'טורונטו', cityEn: 'Toronto', countryHe: 'קנדה', capacity: 45500, latitude: 43.6328, longitude: -79.4186, imageUrl: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80', factHe: 'אצטדיון עירוני קומפקטי על שפת אגם אונטריו.' },
  { id: 'vancouver', nameHe: 'אצטדיון ונקובר', nameEn: 'Vancouver Stadium', cityHe: 'ונקובר', cityEn: 'Vancouver', countryHe: 'קנדה', capacity: 54500, latitude: 49.2768, longitude: -123.1119, imageUrl: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80', factHe: 'גג כבלים ייחודי שנראה כמו מפרש מעל הדאונטאון.' },
  { id: 'atlanta', nameHe: 'אצטדיון אטלנטה', nameEn: 'Atlanta Stadium', cityHe: 'אטלנטה', cityEn: 'Atlanta', countryHe: 'ארצות הברית', capacity: 71000, latitude: 33.7554, longitude: -84.4008, imageUrl: 'https://images.unsplash.com/photo-1505842465776-3c42f29ddca4?auto=format&fit=crop&w=1200&q=80', factHe: 'גג נפתח בהשראת עדשת מצלמה ומסך הילה עצום.' },
  { id: 'boston', nameHe: 'אצטדיון בוסטון', nameEn: 'Boston Stadium', cityHe: 'בוסטון', cityEn: 'Boston', countryHe: 'ארצות הברית', capacity: 65800, latitude: 42.0909, longitude: -71.2643, imageUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=1200&q=80', factHe: 'אצטדיון פתוח עם אווירת פוטבול קלאסית בניו אינגלנד.' },
  { id: 'dallas', nameHe: 'אצטדיון דאלאס', nameEn: 'Dallas Stadium', cityHe: 'דאלאס', cityEn: 'Dallas', countryHe: 'ארצות הברית', capacity: 94000, latitude: 32.7473, longitude: -97.0945, imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80', factHe: 'אחד האצטדיונים הגדולים בטורניר, עם קשתות פלדה עצומות.' },
  { id: 'houston', nameHe: 'אצטדיון יוסטון', nameEn: 'Houston Stadium', cityHe: 'יוסטון', cityEn: 'Houston', countryHe: 'ארצות הברית', capacity: 72200, latitude: 29.6847, longitude: -95.4107, imageUrl: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=80', factHe: 'גג נפתח שמאפשר התאמה לחום ולקצב המשחקים.' },
  { id: 'kansas-city', nameHe: 'אצטדיון קנזס סיטי', nameEn: 'Kansas City Stadium', cityHe: 'קנזס סיטי', cityEn: 'Kansas City', countryHe: 'ארצות הברית', capacity: 76400, latitude: 39.049, longitude: -94.4839, imageUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80', factHe: 'ידוע באקוסטיקה חזקה במיוחד וביציעים תלולים.' },
  { id: 'los-angeles', nameHe: 'אצטדיון לוס אנג׳לס', nameEn: 'Los Angeles Stadium', cityHe: 'לוס אנג׳לס', cityEn: 'Los Angeles', countryHe: 'ארצות הברית', capacity: 70240, latitude: 33.9535, longitude: -118.3392, imageUrl: 'https://images.unsplash.com/photo-1495257008495-441709c6d8ba?auto=format&fit=crop&w=1200&q=80', factHe: 'קומפלקס חדשני עם גג שקוף ורחבה עירונית ענקית.' },
  { id: 'miami', nameHe: 'אצטדיון מיאמי', nameEn: 'Miami Stadium', cityHe: 'מיאמי', cityEn: 'Miami', countryHe: 'ארצות הברית', capacity: 65300, latitude: 25.958, longitude: -80.2389, imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80', factHe: 'אצטדיון טרופי עם הצללה עמוקה סביב היציעים.' },
  { id: 'new-york-new-jersey', nameHe: 'אצטדיון ניו יורק ניו ג׳רזי', nameEn: 'New York New Jersey Stadium', cityHe: 'ניו יורק ניו ג׳רזי', cityEn: 'New York New Jersey', countryHe: 'ארצות הברית', capacity: 82500, latitude: 40.8135, longitude: -74.0745, imageUrl: 'https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=1200&q=80', factHe: 'יארח את גמר מונדיאל 2026 ב-19 ביולי.' },
  { id: 'philadelphia', nameHe: 'אצטדיון פילדלפיה', nameEn: 'Philadelphia Stadium', cityHe: 'פילדלפיה', cityEn: 'Philadelphia', countryHe: 'ארצות הברית', capacity: 69000, latitude: 39.9008, longitude: -75.1675, imageUrl: 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=1200&q=80', factHe: 'נמצא בלב רובע הספורט ההיסטורי של העיר.' },
  { id: 'san-francisco-bay-area', nameHe: 'אצטדיון אזור מפרץ סן פרנסיסקו', nameEn: 'San Francisco Bay Area Stadium', cityHe: 'סן פרנסיסקו', cityEn: 'San Francisco Bay Area', countryHe: 'ארצות הברית', capacity: 68500, latitude: 37.403, longitude: -121.97, imageUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80', factHe: 'אצטדיון הייטק בסמוך לעמק הסיליקון.' },
  { id: 'seattle', nameHe: 'אצטדיון סיאטל', nameEn: 'Seattle Stadium', cityHe: 'סיאטל', cityEn: 'Seattle', countryHe: 'ארצות הברית', capacity: 69000, latitude: 47.5952, longitude: -122.3316, imageUrl: 'https://images.unsplash.com/photo-1517142089942-ba376ce32a2e?auto=format&fit=crop&w=1200&q=80', factHe: 'גג פתוח למחצה שמרכז את הרעש אל תוך המגרש.' },
];

export const fallbackMatches: WorldCupMatch[] = [
  { id: 'm1', matchNumber: 1, stage: 'group', group: 'A', homeTeam: teams.mex, awayTeam: teams.rsa, homeScore: null, awayScore: null, status: 'scheduled', kickoff: WORLD_CUP_START_ISO, venueId: 'mexico-city', broadcaster: 'kan11' },
  { id: 'm2', matchNumber: 2, stage: 'group', group: 'B', homeTeam: teams.can, awayTeam: teams.qat, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-12T00:00:00.000Z', venueId: 'toronto', broadcaster: 'kan11' },
  { id: 'm3', matchNumber: 3, stage: 'group', group: 'D', homeTeam: teams.usa, awayTeam: teams.par, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-13T02:00:00.000Z', venueId: 'los-angeles', broadcaster: 'kan11' },
  { id: 'm4', matchNumber: 4, stage: 'group', group: 'C', homeTeam: teams.bra, awayTeam: teams.mar, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-13T19:00:00.000Z', venueId: 'miami', broadcaster: 'kan11' },
  { id: 'm5', matchNumber: 5, stage: 'group', group: 'E', homeTeam: teams.arg, awayTeam: teams.alg, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-14T00:00:00.000Z', venueId: 'new-york-new-jersey', broadcaster: 'kan11' },
  { id: 'm6', matchNumber: 6, stage: 'group', group: 'F', homeTeam: teams.ger, awayTeam: teams.nzl, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-14T22:00:00.000Z', venueId: 'dallas', broadcaster: 'kan11' },
  { id: 'm7', matchNumber: 7, stage: 'group', group: 'G', homeTeam: teams.eng, awayTeam: teams.cro, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-15T19:00:00.000Z', venueId: 'seattle', broadcaster: 'kan11' },
  { id: 'm8', matchNumber: 8, stage: 'group', group: 'H', homeTeam: teams.esp, awayTeam: teams.jpn, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-06-15T22:00:00.000Z', venueId: 'vancouver', broadcaster: 'kan11' },
  { id: 'm104', matchNumber: 104, stage: 'final', homeTeam: teams.tbd, awayTeam: teams.tbd, homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-07-19T19:00:00.000Z', venueId: 'new-york-new-jersey', broadcaster: 'kan11' },
];

export const fallbackStandings: WorldCupStanding[] = ['A', 'B', 'C', 'D'].flatMap((group) => {
  const groupTeams = group === 'A' ? [teams.mex, teams.rsa, teams.tbd, teams.tbd]
    : group === 'B' ? [teams.can, teams.qat, teams.tbd, teams.tbd]
      : group === 'C' ? [teams.bra, teams.mar, teams.tbd, teams.tbd]
        : [teams.usa, teams.par, teams.tbd, teams.tbd];
  return groupTeams.map((team) => ({
    group,
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
});

export const fallbackPlayerStats: WorldCupPlayerStat[] = [
  { rank: 1, playerName: 'יעודכן עם פתיחת הטורניר', team: teams.tbd, goals: 0, assists: 0, shots: 0, minutes: 0 },
  { rank: 2, playerName: 'נתוני שערים בזמן אמת', team: teams.tbd, goals: 0, assists: 0, shots: 0, minutes: 0 },
  { rank: 3, playerName: 'סטטיסטיקות שחקנים', team: teams.tbd, goals: 0, assists: 0, shots: 0, minutes: 0 },
];
