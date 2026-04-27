'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeName = 'dark' | 'light' | 'midnight' | 'sunset' | 'forest';

type ThemeDefinition = {
  label: string;
  emoji: string;
  colors: Record<string, string>;
};

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const STORAGE_KEY = 'tv-industry-theme';

export const themes: Record<ThemeName, ThemeDefinition> = {
  dark: {
    label: 'לילה',
    emoji: '🌙',
    colors: {
      '--theme-bg': '#050816',
      '--theme-bg-secondary': '#0c1328',
      '--theme-bg-card': '#111a33',
      '--theme-border': 'rgba(148, 163, 184, 0.18)',
      '--theme-text': '#f8fafc',
      '--theme-text-secondary': '#cbd5e1',
      '--theme-accent': '#8b5cf6',
      '--theme-accent-glow': 'rgba(139, 92, 246, 0.18)',
      '--theme-success': '#22c55e',
      '--theme-warning': '#f59e0b',
      '--theme-danger': '#ef4444',
    },
  },
  light: {
    label: 'יום',
    emoji: '☀️',
    colors: {
      '--theme-bg': '#f6f8fc',
      '--theme-bg-secondary': '#ffffff',
      '--theme-bg-card': '#ffffff',
      '--theme-border': 'rgba(15, 23, 42, 0.10)',
      '--theme-text': '#0f172a',
      '--theme-text-secondary': '#475569',
      '--theme-accent': '#2563eb',
      '--theme-accent-glow': 'rgba(37, 99, 235, 0.12)',
      '--theme-success': '#16a34a',
      '--theme-warning': '#d97706',
      '--theme-danger': '#dc2626',
    },
  },
  midnight: {
    label: 'כחול עמוק',
    emoji: '🌌',
    colors: {
      '--theme-bg': '#020617',
      '--theme-bg-secondary': '#09111f',
      '--theme-bg-card': '#0e172a',
      '--theme-border': 'rgba(96, 165, 250, 0.18)',
      '--theme-text': '#e2e8f0',
      '--theme-text-secondary': '#93c5fd',
      '--theme-accent': '#38bdf8',
      '--theme-accent-glow': 'rgba(56, 189, 248, 0.16)',
      '--theme-success': '#22c55e',
      '--theme-warning': '#fbbf24',
      '--theme-danger': '#f87171',
    },
  },
  sunset: {
    label: 'שקיעה',
    emoji: '🌇',
    colors: {
      '--theme-bg': '#1b1020',
      '--theme-bg-secondary': '#26152d',
      '--theme-bg-card': '#311b3b',
      '--theme-border': 'rgba(251, 146, 60, 0.18)',
      '--theme-text': '#fff7ed',
      '--theme-text-secondary': '#fed7aa',
      '--theme-accent': '#f97316',
      '--theme-accent-glow': 'rgba(249, 115, 22, 0.18)',
      '--theme-success': '#34d399',
      '--theme-warning': '#fb7185',
      '--theme-danger': '#ef4444',
    },
  },
  forest: {
    label: 'יער',
    emoji: '🌿',
    colors: {
      '--theme-bg': '#07150f',
      '--theme-bg-secondary': '#0d2118',
      '--theme-bg-card': '#143126',
      '--theme-border': 'rgba(74, 222, 128, 0.18)',
      '--theme-text': '#f0fdf4',
      '--theme-text-secondary': '#bbf7d0',
      '--theme-accent': '#22c55e',
      '--theme-accent-glow': 'rgba(34, 197, 94, 0.16)',
      '--theme-success': '#4ade80',
      '--theme-warning': '#facc15',
      '--theme-danger': '#fb7185',
    },
  },
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
});

function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') {
    return;
  }

  const nextTheme = themes[theme] ?? themes.dark;
  const root = document.documentElement;

  Object.entries(nextTheme.colors).forEach(([variable, value]) => {
    root.style.setProperty(variable, value);
  });

  root.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedTheme = window.localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    const initialTheme = storedTheme && storedTheme in themes ? storedTheme : 'dark';
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const setTheme = useCallback((nextTheme: ThemeName) => {
    setThemeState(nextTheme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    }
    applyTheme(nextTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
