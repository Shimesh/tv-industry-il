'use client';

import { useEffect, useState } from 'react';

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
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return <QuickMenuDrawer open={open} onClose={() => setOpen(false)} />;
}
