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
    label: 'קינמטי',
    emoji: '🎬',
    colors: {
      '--background': '#0a0a0f',
      '--foreground': '#ffffff',
      '--theme-bg': '#0a0a0f',
      '--theme-bg-secondary': '#0f0f1a',
      '--theme-bg-card': '#13131f',
      '--theme-nav-bg': 'rgba(10, 10, 15, 0.95)',
      '--theme-border': 'rgba(0, 240, 255, 0.10)',
      '--theme-text': '#ffffff',
      '--theme-text-secondary': '#a0aec0',
      '--theme-accent': '#00f0ff',
      '--theme-accent-secondary': '#9d4edd',
      '--theme-accent-glow': 'rgba(0, 240, 255, 0.18)',
      '--theme-success': '#22c55e',
      '--theme-warning': '#f59e0b',
      '--theme-danger': '#ef4444',
      '--theme-info': '#38bdf8',
    },
  },
  light: {
    label: 'שנהב',
    emoji: '📜',
    colors: {
      '--background': '#f6efe2',
      '--foreground': '#2a1f1a',
      '--theme-bg': '#f6efe2',
      '--theme-bg-secondary': '#fbf6ec',
      '--theme-bg-card': '#ffffff',
      '--theme-nav-bg': 'rgba(251, 246, 236, 0.94)',
      '--theme-border': 'rgba(60, 42, 33, 0.12)',
      '--theme-text': '#2a1f1a',
      '--theme-text-secondary': '#6b574a',
      '--theme-accent': '#c84e3e',
      '--theme-accent-secondary': '#2f7a72',
      '--theme-accent-glow': 'rgba(200, 78, 62, 0.14)',
      '--theme-success': '#16a34a',
      '--theme-warning': '#d97706',
      '--theme-danger': '#dc2626',
      '--theme-info': '#0284c7',
    },
  },
  midnight: {
    label: 'אינדיגו',
    emoji: '🌌',
    colors: {
      '--background': '#0a0e2a',
      '--foreground': '#ede4d3',
      '--theme-bg': '#0a0e2a',
      '--theme-bg-secondary': '#131a3d',
      '--theme-bg-card': '#1c2453',
      '--theme-nav-bg': 'rgba(10, 14, 42, 0.94)',
      '--theme-border': 'rgba(196, 181, 253, 0.18)',
      '--theme-text': '#ede4d3',
      '--theme-text-secondary': '#a5b4d8',
      '--theme-accent': '#f4a261',
      '--theme-accent-secondary': '#e76f51',
      '--theme-accent-glow': 'rgba(244, 162, 97, 0.18)',
      '--theme-success': '#22c55e',
      '--theme-warning': '#fbbf24',
      '--theme-danger': '#f87171',
      '--theme-info': '#38bdf8',
    },
  },
  sunset: {
    label: 'נחושת',
    emoji: '🥃',
    colors: {
      '--background': '#1a0e0a',
      '--foreground': '#fbe9d3',
      '--theme-bg': '#1a0e0a',
      '--theme-bg-secondary': '#261611',
      '--theme-bg-card': '#321d17',
      '--theme-nav-bg': 'rgba(26, 14, 10, 0.94)',
      '--theme-border': 'rgba(244, 162, 97, 0.18)',
      '--theme-text': '#fbe9d3',
      '--theme-text-secondary': '#d4a574',
      '--theme-accent': '#d97757',
      '--theme-accent-secondary': '#6b9080',
      '--theme-accent-glow': 'rgba(217, 119, 87, 0.20)',
      '--theme-success': '#34d399',
      '--theme-warning': '#fb7185',
      '--theme-danger': '#ef4444',
      '--theme-info': '#38bdf8',
    },
  },
  forest: {
    label: 'מרווה',
    emoji: '🌿',
    colors: {
      '--background': '#0c1612',
      '--foreground': '#f0e6d2',
      '--theme-bg': '#0c1612',
      '--theme-bg-secondary': '#16241d',
      '--theme-bg-card': '#1f3329',
      '--theme-nav-bg': 'rgba(12, 22, 18, 0.94)',
      '--theme-border': 'rgba(212, 165, 116, 0.16)',
      '--theme-text': '#f0e6d2',
      '--theme-text-secondary': '#b8c5b1',
      '--theme-accent': '#d4a574',
      '--theme-accent-secondary': '#c84e3e',
      '--theme-accent-glow': 'rgba(212, 165, 116, 0.18)',
      '--theme-success': '#4ade80',
      '--theme-warning': '#facc15',
      '--theme-danger': '#fb7185',
      '--theme-info': '#38bdf8',
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
