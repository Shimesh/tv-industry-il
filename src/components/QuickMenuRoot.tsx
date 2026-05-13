'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';

import QuickMenuDrawer from '@/components/QuickMenuDrawer';
import { type QuickMenuPosition, useQuickMenuPosition } from '@/hooks/useQuickMenuPosition';

export const QUICK_MENU_OPEN_EVENT = 'tv-quick-menu-open';

export function openQuickMenu() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(QUICK_MENU_OPEN_EVENT));
}

const fabPlacement: Record<QuickMenuPosition, string> = {
  right: 'right-[calc(var(--safe-area-right)+1rem)] top-1/2 -translate-y-1/2',
  left: 'left-[calc(var(--safe-area-left)+1rem)] top-1/2 -translate-y-1/2',
  top: 'left-1/2 top-[calc(var(--app-header-offset)+1rem)] -translate-x-1/2',
  bottom: 'bottom-[calc(var(--safe-area-bottom)+1rem)] left-1/2 -translate-x-1/2',
};

export default function QuickMenuRoot() {
  const [open, setOpen] = useState(false);
  const { position } = useQuickMenuPosition();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpen = () => setOpen(true);
    window.addEventListener(QUICK_MENU_OPEN_EVENT, handleOpen);

    return () => window.removeEventListener(QUICK_MENU_OPEN_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleFabClick = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleFabClick}
        className={`group fixed z-[9998] flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 text-[var(--theme-accent)] shadow-2xl shadow-black/25 backdrop-blur-2xl transition-all hover:border-[var(--theme-accent)]/40 hover:bg-white/10 hover:shadow-[0_0_28px_var(--theme-accent-glow)] active:scale-[0.90] ${fabPlacement[position]}`}
        aria-label="פתיחת תפריט מהיר"
        title="תפריט מהיר"
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_35%,var(--theme-accent-glow),transparent_62%)] opacity-80" />
        <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: '0 0 26px var(--theme-accent-glow)' }} />
        <LayoutGrid className="relative h-6 w-6" strokeWidth={1.5} />
      </button>

      <QuickMenuDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
