'use client';

import { useState, useRef, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
        title="ערכת נושא"
      >
        <Palette className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shadow-2xl z-50 overflow-hidden animate-fade-in">
          <div className="p-2">
            <p className="text-xs text-[var(--theme-text-secondary)] px-2 py-1 font-medium">ערכת נושא</p>
            {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => { setTheme(key); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  theme === key
                    ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]'
                }`}
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="font-medium">{t.label}</span>
                {theme === key && (
                  <span className="mr-auto w-2 h-2 rounded-full bg-[var(--theme-accent)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
