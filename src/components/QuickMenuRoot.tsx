'use client';

import { useEffect, useState } from 'react';

import QuickMenuDrawer from '@/components/QuickMenuDrawer';

function TvRemoteIcon() {
  return (
    <svg
      viewBox="0 0 14 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 13, height: 26, filter: 'drop-shadow(0 0 5px rgba(234,179,8,0.95)) drop-shadow(0 0 10px rgba(234,179,8,0.6))' }}
      aria-hidden="true"
    >
      {/* Remote body */}
      <rect x="0.75" y="0.75" width="12.5" height="26.5" rx="3.5" stroke="currentColor" strokeWidth="1.5" />

      {/* Power symbol */}
      <path d="M5.3 6.6 A2.3 2.3 0 1 0 8.7 6.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <line x1="7" y1="4" x2="7" y2="7.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />

      {/* Channel up arrow */}
      <path d="M5.5 12.2 L7 10.3 L8.5 12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Channel down arrow */}
      <path d="M5.5 15.2 L7 17.1 L8.5 15.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Number buttons – 3×2 grid + 1 center */}
      <circle cx="4" cy="19.8" r="0.95" fill="currentColor" />
      <circle cx="7" cy="19.8" r="0.95" fill="currentColor" />
      <circle cx="10" cy="19.8" r="0.95" fill="currentColor" />
      <circle cx="4" cy="22.8" r="0.95" fill="currentColor" />
      <circle cx="7" cy="22.8" r="0.95" fill="currentColor" />
      <circle cx="10" cy="22.8" r="0.95" fill="currentColor" />
      <circle cx="7" cy="25.8" r="0.95" fill="currentColor" />
    </svg>
  );
}

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
        className="fixed top-1/2 right-0 z-[9998] -translate-y-1/2 flex items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-slate-950/60 text-yellow-400 shadow-lg backdrop-blur-xl transition-all hover:bg-white/10 active:scale-95"
        style={{ width: 28, height: 56 }}
        aria-label="פתיחת תפריט מהיר"
        title="תפריט מהיר"
      >
        <TvRemoteIcon />
      </button>

      <QuickMenuDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
