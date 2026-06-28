'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WorldCupMatch } from '@/lib/world-cup/types';

type WorldCupContextValue = {
  isWorldCupMode: boolean;
  activeMatch: WorldCupMatch | null;
  activeMatches: WorldCupMatch[];
  nextMatch: WorldCupMatch | null;
  nextMatches: WorldCupMatch[];
  refresh: () => Promise<void>;
};

const WorldCupContext = createContext<WorldCupContextValue>({
  isWorldCupMode: false,
  activeMatch: null,
  activeMatches: [],
  nextMatch: null,
  nextMatches: [],
  refresh: async () => {},
});

const WORLD_CUP_COLORS = {
  '--wc-deep-blue': '#002046',
  '--wc-stadium-green': '#138a36',
  '--wc-gold': '#D4AF37',
  '--wc-gold-glow': 'rgba(212, 175, 55, 0.34)',
};

function applyWorldCupMode(active: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  Object.entries(WORLD_CUP_COLORS).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.worldCupMode = active ? 'active' : 'idle';

  if (active) {
    root.style.setProperty('--theme-accent', WORLD_CUP_COLORS['--wc-gold']);
    root.style.setProperty('--theme-accent-secondary', WORLD_CUP_COLORS['--wc-stadium-green']);
    root.style.setProperty('--theme-accent-glow', WORLD_CUP_COLORS['--wc-gold-glow']);
    root.style.setProperty('--theme-nav-bg', 'rgba(0, 32, 70, 0.96)');
  }
}

function getNextMatches(matches: WorldCupMatch[]): WorldCupMatch[] {
  const now = Date.now();
  const upcoming = matches
    .filter((match) => match.status !== 'finished' && Date.parse(match.kickoff) >= now - 2 * 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  if (upcoming.length === 0) return [];
  const firstKickoff = Date.parse(upcoming[0].kickoff);
  // Return all matches within 2 minutes of the earliest kickoff (handles simultaneous matches)
  return upcoming.filter((m) => Math.abs(Date.parse(m.kickoff) - firstKickoff) <= 2 * 60 * 1000);
}

export function WorldCupProvider({ children }: { children: React.ReactNode }) {
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);

  const refresh = useMemo(() => async () => {
    // Add cache-busting param so Vercel CDN never serves a stale edge-cached response
    const response = await fetch(`/api/world-cup/matches?_t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const payload = (await response.json()) as { matches?: WorldCupMatch[] };
    if (Array.isArray(payload.matches)) setMatches(payload.matches);
  }, []);

  // Stabilise references — only update when the match ID actually changes,
  // so context consumers don't re-render on every poll cycle.
  const activeMatches = useMemo(() => (
    matches
      .filter((m) => m.status === 'live')
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
  ), [matches]);

  const activeMatch = activeMatches[0] ?? null;

  useEffect(() => {
    void refresh();
    // Poll faster when a match is live (10s), slower otherwise (15s, matching hub page)
    const interval = window.setInterval(() => void refresh(), activeMatch ? 10_000 : 15_000);
    return () => window.clearInterval(interval);
  }, [refresh, activeMatch]);

  const nextMatches = useMemo(() => getNextMatches(matches), [matches]);
  const nextMatch = nextMatches[0] ?? null;

  const isWorldCupMode = activeMatches.length > 0;

  useEffect(() => {
    applyWorldCupMode(isWorldCupMode);
  }, [isWorldCupMode]);

  const value = useMemo(
    () => ({ isWorldCupMode, activeMatch, activeMatches, nextMatch, nextMatches, refresh }),
    [activeMatch, activeMatches, isWorldCupMode, nextMatch, nextMatches, refresh],
  );

  return <WorldCupContext.Provider value={value}>{children}</WorldCupContext.Provider>;
}

export function useWorldCup() {
  return useContext(WorldCupContext);
}
