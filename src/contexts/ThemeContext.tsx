'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeName = 'dark' | 'light' | 'midnight' | 'sunset' | 'forest';

interface ThemeColors {
  bg: string;
  bgSecondary: string;
  bgCard: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentSecondary: string;
  accentGlow: string;
  navBg: string;
}

export const themes: Record<ThemeName, { label: string; emoji: string; colors: ThemeColors }> = {
  dark: {
    label: 'כהה',
    emoji: '🌙',
    colors: {
      bg: '#030712',
      bgSecondary: '#111827',
      bgCard: 'rgba(17, 24, 39, 0.5)',
      text: '#f3f4f6',
      textSecondary: '#9ca3af',
      border: '#1f2937',
      accent: '#a78bfa',
      accentSecondary: '#60a5fa',
      accentGlow: 'rgba(139, 92, 246, 0.15)',
      navBg: 'rgba(17, 24, 39, 0.8)',
    },
  },
  light: {
    label: 'בהיר',
    emoji: '☀️',
    colors: {
      bg: '#f8fafc',
      bgSecondary: '#eef2f7',
      bgCard: 'rgba(255, 255, 255, 0.95)',
      text: '#1e293b',
      textSecondary: '#475569',
      border: '#d1d5db',
      accent: '#7c3aed',
      accentSecondary: '#3b82f6',
      accentGlow: 'rgba(124, 58, 237, 0.08)',
      navBg: 'rgba(255, 255, 255, 0.95)',
    },
  },
  midnight: {
    label: 'חצות',
    emoji: '🌌',
    colors: {
      bg: '#0f172a',
      bgSecondary: '#1e293b',
      bgCard: 'rgba(30, 41, 59, 0.5)',
      text: '#e2e8f0',
      textSecondary: '#94a3b8',
      border: '#334155',
      accent: '#22d3ee',
      accentSecondary: '#3b82f6',
      accentGlow: 'rgba(34, 211, 238, 0.15)',
      navBg: 'rgba(15, 23, 42, 0.8)',
    },
  },
  sunset: {
    label: 'שקיעה',
    emoji: '🌅',
    colors: {
      bg: '#1c1917',
      bgSecondary: '#292524',
      bgCard: 'rgba(41, 37, 36, 0.5)',
      text: '#fef3c7',
      textSecondary: '#d6d3d1',
      border: '#44403c',
      accent: '#fb923c',
      accentSecondary: '#f472b6',
      accentGlow: 'rgba(251, 146, 60, 0.15)',
      navBg: 'rgba(28, 25, 23, 0.8)',
    },
  },
  forest: {
    label: 'יער',
    emoji: '🌿',
    colors: {
      bg: '#0c1a14',
      bgSecondary: '#1a2e23',
      bgCard: 'rgba(26, 46, 35, 0.7)',
      text: '#e8f5e9',
      textSecondary: '#a5d6a7',
      border: '#2e4a38',
      accent: '#66bb6a',
      accentSecondary: '#26a69a',
      accentGlow: 'rgba(102, 187, 106, 0.12)',
      navBg: 'rgba(12, 26, 20, 0.92)',
    },
  },
};

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  colors: themes.dark.colors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('tv-theme') as ThemeName;
    if (saved && themes[saved]) {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const colors = themes[theme].colors;
    const root = document.documentElement;

    root.style.setProperty('--theme-bg', colors.bg);
    root.style.setProperty('--theme-bg-secondary', colors.bgSecondary);
    root.style.setProperty('--theme-bg-card', colors.bgCard);
    root.style.setProperty('--theme-text', colors.text);
    root.style.setProperty('--theme-text-secondary', colors.textSecondary);
    root.style.setProperty('--theme-border', colors.border);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-accent-secondary', colors.accentSecondary);
    root.style.setProperty('--theme-accent-glow', colors.accentGlow);
    root.style.setProperty('--theme-nav-bg', colors.navBg);

    // Update body classes
    document.body.style.background = colors.bg;
    document.body.style.color = colors.text;
    document.body.setAttribute('data-theme', theme);
  }, [theme, mounted]);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('tv-theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors: themes[theme].colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
