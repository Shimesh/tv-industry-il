import type { Metadata } from 'next';
import WorldCupHubClient from '@/components/world-cup/WorldCupHubClient';
import { deriveStandingsFromMatches, getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'מונדיאל 2026 | TV Industry IL',
  description: 'מרכז מונדיאל 2026 בעברית: שידור חי, לוח משחקים, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים.',
};

export default async function WorldCupPage() {
  const [{ matches, source, updatedAt }, { standings: apiStandings }, playerStats] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
    getWorldCupPlayerStats(),
  ]);

  const allZero = apiStandings.every(s => s.played === 0);
  const finished = matches.filter(m => m.status === 'finished' && m.homeScore != null && m.awayScore != null);
  const standings = (allZero && finished.length > 0) ? deriveStandingsFromMatches(finished) : apiStandings;

  return (
    <WorldCupHubClient
      matches={matches}
      standings={standings}
      playerStats={playerStats}
      venues={getWorldCupVenues()}
      source={source}
      updatedAt={updatedAt}
    />
  );
}
