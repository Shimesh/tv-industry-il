'use client';

import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { ThemeName, themes, useTheme } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg p-2 transition-colors hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text)]"
        style={{ color: 'var(--theme-text-secondary)' }}
        title="בחר ערכת נושא"
      >
        <Palette className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border bg-[var(--theme-bg-secondary)] shadow-2xl">
          <div className="p-2">
            <p className="px-2 py-1 text-xs font-medium text-[var(--theme-text-secondary)]">ערכות נושא</p>
            {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, value]) => (
              <button
                key={key}
                onClick={() => {
                  setTheme(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  theme === key
                    ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]'
                }`}
              >
                <span className="text-lg">{value.emoji}</span>
                <span className="font-medium">{value.label}</span>
                {theme === key ? (
                  <span className="mr-auto h-2 w-2 rounded-full bg-[var(--theme-accent)]" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
