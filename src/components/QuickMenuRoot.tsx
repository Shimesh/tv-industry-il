'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';

import QuickMenuDrawer from '@/components/QuickMenuDrawer';

export const QUICK_MENU_OPEN_EVENT = 'tv-quick-menu-open';

export function openQuickMenu() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(QUICK_MENU_OPEN_EVENT));
}

export default function QuickMenuRoot() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOpen = () => setOpen(true);
    window.addEventListener(QUICK_MENU_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(QUICK_MENU_OPEN_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-1/2 right-0 z-[9998] -translate-y-1/2 flex items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-slate-950/60 text-[var(--theme-accent)] shadow-lg backdrop-blur-xl transition-all hover:bg-white/10 hover:shadow-[0_0_20px_var(--theme-accent-glow)] active:scale-95"
        style={{ width: 28, height: 56 }}
        aria-label="פתיחת תפריט מהיר"
        title="תפריט מהיר"
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <QuickMenuDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
