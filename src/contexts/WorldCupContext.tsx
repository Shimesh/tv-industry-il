'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WorldCupMatch } from '@/lib/world-cup/types';

type WorldCupContextValue = {
  isWorldCupMode: boolean;
  activeMatch: WorldCupMatch | null;
  nextMatch: WorldCupMatch | null;
  refresh: () => Promise<void>;
};

const WorldCupContext = createContext<WorldCupContextValue>({
  isWorldCupMode: false,
  activeMatch: null,
  nextMatch: null,
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

function getNextMatch(matches: WorldCupMatch[]) {
  const now = Date.now();
  return matches
    .filter((match) => match.status !== 'finished' && Date.parse(match.kickoff) >= now - 2 * 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] ?? null;
}

export function WorldCupProvider({ children }: { children: React.ReactNode }) {
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);

  const refresh = useMemo(() => async () => {
    const response = await fetch('/api/world-cup/matches', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = (await response.json()) as { matches?: WorldCupMatch[] };
    if (Array.isArray(payload.matches)) setMatches(payload.matches);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const activeMatch = useMemo(() => matches.find((match) => match.status === 'live') ?? null, [matches]);
  const nextMatch = useMemo(() => getNextMatch(matches), [matches]);
  const isWorldCupMode = Boolean(activeMatch);

  useEffect(() => {
    applyWorldCupMode(isWorldCupMode);
  }, [isWorldCupMode]);

  const value = useMemo(
    () => ({ isWorldCupMode, activeMatch, nextMatch, refresh }),
    [activeMatch, isWorldCupMode, nextMatch, refresh],
  );

  return <WorldCupContext.Provider value={value}>{children}</WorldCupContext.Provider>;
}

export function useWorldCup() {
  return useContext(WorldCupContext);
}
