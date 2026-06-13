'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldCupMatch } from '@/lib/world-cup/types';
import { fallbackMatches } from '@/lib/world-cup/static-data';

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
  // Seed with fallback so consumers render correctly before the first API response
  const [matches, setMatches] = useState<WorldCupMatch[]>(fallbackMatches);

  const refresh = useMemo(() => async () => {
    const response = await fetch('/api/world-cup/matches', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = (await response.json()) as { matches?: WorldCupMatch[] };
    if (Array.isArray(payload.matches)) setMatches(payload.matches);
  }, []);

  // Stabilise references — only update when the match ID actually changes,
  // so context consumers don't re-render on every poll cycle.
  const prevActiveRef = useRef<WorldCupMatch | null>(null);
  const activeMatch = useMemo(() => {
    const found = matches.find((m) => m.status === 'live') ?? null;
    if (found?.id === prevActiveRef.current?.id) return prevActiveRef.current;
    prevActiveRef.current = found;
    return found;
  }, [matches]);

  useEffect(() => {
    void refresh();
    // Poll faster when a match is live (10s), slower otherwise (15s, matching hub page)
    const interval = window.setInterval(() => void refresh(), activeMatch ? 10_000 : 15_000);
    return () => window.clearInterval(interval);
  }, [refresh, activeMatch]);

  const prevNextRef = useRef<WorldCupMatch | null>(null);
  const nextMatch = useMemo(() => {
    const found = getNextMatch(matches);
    if (found?.id === prevNextRef.current?.id) return prevNextRef.current;
    prevNextRef.current = found;
    return found;
  }, [matches]);

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
