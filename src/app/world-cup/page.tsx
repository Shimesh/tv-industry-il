import type { Metadata } from 'next';
import WorldCupHubClient from '@/components/world-cup/WorldCupHubClient';
import { getWorldCupMatches, getWorldCupPlayerStats, getWorldCupStandings, getWorldCupVenues } from '@/lib/world-cup/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'מונדיאל 2026 | TV Industry IL',
  description: 'מרכז מונדיאל 2026 בעברית: שידור חי, לוח משחקים, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים.',
};

export default async function WorldCupPage() {
  const [{ matches, source, updatedAt }, { standings }, playerStats] = await Promise.all([
    getWorldCupMatches(),
    getWorldCupStandings(),
    getWorldCupPlayerStats(),
  ]);

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
