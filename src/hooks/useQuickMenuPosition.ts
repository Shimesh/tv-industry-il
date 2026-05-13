'use client';

import { useCallback, useEffect, useState } from 'react';

export type QuickMenuPosition = 'right' | 'left' | 'top' | 'bottom';

export const QUICK_MENU_POSITION_STORAGE_KEY = 'tv-menu-position';
export const QUICK_MENU_POSITION_EVENT = 'tv-menu-position-change';

const positions = new Set<QuickMenuPosition>(['right', 'left', 'top', 'bottom']);

function isQuickMenuPosition(value: unknown): value is QuickMenuPosition {
  return typeof value === 'string' && positions.has(value as QuickMenuPosition);
}

export function readStoredQuickMenuPosition(): QuickMenuPosition {
  if (typeof window === 'undefined') return 'right';

  try {
    const stored = window.localStorage.getItem(QUICK_MENU_POSITION_STORAGE_KEY);
    return isQuickMenuPosition(stored) ? stored : 'right';
  } catch {
    return 'right';
  }
}

export function writeStoredQuickMenuPosition(position: QuickMenuPosition) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(QUICK_MENU_POSITION_STORAGE_KEY, position);
    window.dispatchEvent(new CustomEvent<QuickMenuPosition>(QUICK_MENU_POSITION_EVENT, { detail: position }));
  } catch {
    window.dispatchEvent(new CustomEvent<QuickMenuPosition>(QUICK_MENU_POSITION_EVENT, { detail: position }));
  }
}

export function useQuickMenuPosition() {
  const [position, setPositionState] = useState<QuickMenuPosition>('right');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialTimer = window.setTimeout(() => {
      setPositionState(readStoredQuickMenuPosition());
    }, 0);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === QUICK_MENU_POSITION_STORAGE_KEY) {
        setPositionState(isQuickMenuPosition(event.newValue) ? event.newValue : 'right');
      }
    };

    const handleCustomEvent = (event: Event) => {
      const nextPosition = (event as CustomEvent<QuickMenuPosition>).detail;
      if (isQuickMenuPosition(nextPosition)) {
        setPositionState(nextPosition);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(QUICK_MENU_POSITION_EVENT, handleCustomEvent);

    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(QUICK_MENU_POSITION_EVENT, handleCustomEvent);
    };
  }, []);

  const setPosition = useCallback((nextPosition: QuickMenuPosition) => {
    setPositionState(nextPosition);
    writeStoredQuickMenuPosition(nextPosition);
  }, []);

  return { position, setPosition };
}
