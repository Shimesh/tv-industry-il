import type { Metadata } from 'next';
import WorldCupHubClient from '@/components/world-cup/WorldCupHubClient';
import { getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'מונדיאל 2026 | TV Industry IL',
  description: 'מרכז מונדיאל 2026 בעברית: שידור חי, לוח משחקים, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים.',
};

export default async function WorldCupPage() {
  const [{ matches, source, updatedAt }, { standings }] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
  ]);

  return (
    <WorldCupHubClient
      matches={matches}
      standings={standings}
      playerStats={getWorldCupPlayerStats()}
      venues={getWorldCupVenues()}
      source={source}
      updatedAt={updatedAt}
    />
  );
}
