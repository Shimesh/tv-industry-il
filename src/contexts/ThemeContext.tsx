'use client';

import {
  createContext,
  useCallback,
  useContext,
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
    label: 'דמדומים',
    emoji: '🌆',
    colors: {
      '--background': '#18112e',
      '--foreground': '#fffaf4',
      '--theme-bg': '#18112e',
      '--theme-bg-secondary': '#251c43',
      '--theme-bg-card': '#312653',
      '--theme-nav-bg': 'rgba(19, 13, 39, 0.96)',
      '--theme-border': 'rgba(255, 244, 236, 0.22)',
      '--theme-text': '#fffaf4',
      '--theme-text-secondary': '#ded2e7',
      '--theme-accent': '#ff6a3d',
      '--theme-accent-secondary': '#56d6ca',
      '--theme-accent-glow': 'rgba(255, 106, 61, 0.30)',
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
      '--background': '#101947',
      '--foreground': '#fff8e9',
      '--theme-bg': '#101947',
      '--theme-bg-secondary': '#1c285d',
      '--theme-bg-card': '#28366f',
      '--theme-nav-bg': 'rgba(12, 20, 58, 0.96)',
      '--theme-border': 'rgba(222, 228, 255, 0.26)',
      '--theme-text': '#fff8e9',
      '--theme-text-secondary': '#d6ddf3',
      '--theme-accent': '#ffc14d',
      '--theme-accent-secondary': '#ff7048',
      '--theme-accent-glow': 'rgba(255, 193, 77, 0.30)',
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
      '--background': '#2b160f',
      '--foreground': '#fff3df',
      '--theme-bg': '#2b160f',
      '--theme-bg-secondary': '#3b2118',
      '--theme-bg-card': '#4a2b21',
      '--theme-nav-bg': 'rgba(37, 18, 12, 0.96)',
      '--theme-border': 'rgba(255, 210, 174, 0.27)',
      '--theme-text': '#fff3df',
      '--theme-text-secondary': '#f0cda8',
      '--theme-accent': '#ff784e',
      '--theme-accent-secondary': '#72c7ae',
      '--theme-accent-glow': 'rgba(255, 120, 78, 0.31)',
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
      '--background': '#12261d',
      '--foreground': '#fff4df',
      '--theme-bg': '#12261d',
      '--theme-bg-secondary': '#1d362a',
      '--theme-bg-card': '#29483a',
      '--theme-nav-bg': 'rgba(14, 32, 24, 0.96)',
      '--theme-border': 'rgba(231, 219, 183, 0.25)',
      '--theme-text': '#fff4df',
      '--theme-text-secondary': '#d2e2cf',
      '--theme-accent': '#ffc27a',
      '--theme-accent-secondary': '#ff715c',
      '--theme-accent-glow': 'rgba(255, 194, 122, 0.30)',
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
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    return stored && stored in themes ? stored : 'dark';
  });

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
