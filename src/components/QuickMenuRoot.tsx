'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { LayoutGrid } from 'lucide-react';

import QuickMenuDrawer from '@/components/QuickMenuDrawer';
import { type QuickMenuPosition, useQuickMenuPosition } from '@/hooks/useQuickMenuPosition';
import { useWorldCup } from '@/contexts/WorldCupContext';

export const QUICK_MENU_OPEN_EVENT = 'tv-quick-menu-open';

export function openQuickMenu() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(QUICK_MENU_OPEN_EVENT));
}

type FabPosition = {
  x: number;
  y: number;
};

const FAB_POSITION_STORAGE_KEY = 'tv-industry-il-quick-menu-fab-position-v2';
const FAB_SIZE = 56;
const EDGE_MARGIN = 20;
const DRAG_THRESHOLD = 5;

export default function QuickMenuRoot() {
  const { isWorldCupMode } = useWorldCup();
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fabPosition, setFabPosition] = useState<FabPosition>({ x: EDGE_MARGIN, y: EDGE_MARGIN });
  const { position } = useQuickMenuPosition();
  const justDraggedRef = useRef(false);
  const manualPositionRef = useRef(false);
  const positionStorageReadyRef = useRef(false);
  const dragRef = useRef({
    active: false,
    moved: false,
    startClientX: 0,
    startClientY: 0,
    startX: 0,
    startY: 0,
  });

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedPosition = window.localStorage.getItem(FAB_POSITION_STORAGE_KEY);
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition) as FabPosition;
        manualPositionRef.current = true;
        setFabPosition(clampFabPosition(parsed.x, parsed.y));
        return;
      }
    } catch {
      // Position memory is progressive enhancement; fall back to drawer side.
    }

    setFabPosition(getDefaultFabPosition(position));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (manualPositionRef.current || typeof window === 'undefined') return;
    setFabPosition(getDefaultFabPosition(position));
  }, [position]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setFabPosition((current) => clampFabPosition(current.x, current.y));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!positionStorageReadyRef.current) {
      positionStorageReadyRef.current = true;
      return;
    }

    if (!manualPositionRef.current || typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(FAB_POSITION_STORAGE_KEY, JSON.stringify(fabPosition));
    } catch {
      // Ignore storage failures; dragging still works for the current session.
    }
  }, [fabPosition]);

  const handleFabClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    setOpen(true);
  };

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = {
      active: true,
      moved: false,
      startClientX: clientX,
      startClientY: clientY,
      startX: fabPosition.x,
      startY: fabPosition.y,
    };
    justDraggedRef.current = false;
    setIsDragging(true);
  };

  const updateDragPosition = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > DRAG_THRESHOLD) {
      drag.moved = true;
      manualPositionRef.current = true;
      setOpen(false);
    }

    setFabPosition(clampFabPosition(drag.startX + deltaX, drag.startY + deltaY));
  };

  const finishDrag = () => {
    if (dragRef.current.moved) {
      justDraggedRef.current = true;
    }

    dragRef.current.active = false;
    setIsDragging(false);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    startDrag(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startDrag(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      updateDragPosition(event.clientX, event.clientY);
    };

    const handleMouseUp = () => {
      finishDrag();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      event.preventDefault();
      updateDragPosition(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
      finishDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isDragging]);

  return (
    <>
      <div
        className={`fixed z-[10000] ${isDragging ? '' : 'quick-menu-fab-float'}`}
        style={{
          left: fabPosition.x,
          top: fabPosition.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
        }}
      >
        <button
          type="button"
          onClick={handleFabClick}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`group relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border bg-slate-950/55 text-[var(--theme-accent)] shadow-[0_18px_45px_rgba(0,0,0,0.38),0_0_28px_var(--theme-accent-glow)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-[var(--theme-accent)]/40 hover:bg-white/10 hover:shadow-[0_22px_52px_rgba(0,0,0,0.44),0_0_34px_var(--theme-accent-glow)] active:scale-[0.90] ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            borderColor: isWorldCupMode ? 'var(--wc-gold)' : 'rgba(255,255,255,.15)',
            boxShadow: isWorldCupMode
              ? '0 18px 45px rgba(0,0,0,.38), 0 0 34px var(--wc-gold-glow), inset 0 0 0 1px var(--wc-gold)'
              : undefined,
          }}
          aria-label="פתיחת תפריט מהיר"
          title="תפריט מהיר"
        >
          <span className="pointer-events-none absolute -inset-2 rounded-full bg-[radial-gradient(circle_at_50%_35%,var(--theme-accent-glow),transparent_66%)] opacity-90 blur-sm" />
          <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: '0 0 30px var(--theme-accent-glow)' }} />
          <LayoutGrid className="relative h-6 w-6" strokeWidth={1.5} />
        </button>
      </div>

      <QuickMenuDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function clampFabPosition(x: number, y: number): FabPosition {
  if (typeof window === 'undefined') return { x, y };

  const minX = EDGE_MARGIN;
  const headerOffset = readCssPixelValue('--app-header-offset');
  const minY = headerOffset + EDGE_MARGIN;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - FAB_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - FAB_SIZE - EDGE_MARGIN);

  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

function getDefaultFabPosition(position: QuickMenuPosition): FabPosition {
  if (typeof window === 'undefined') return { x: EDGE_MARGIN, y: EDGE_MARGIN };

  const centerX = (window.innerWidth - FAB_SIZE) / 2;
  const lowerY = window.innerHeight - FAB_SIZE - 96;
  const headerOffset = readCssPixelValue('--app-header-offset');

  switch (position) {
    case 'left':
      return clampFabPosition(EDGE_MARGIN, lowerY);
    case 'top':
      return clampFabPosition(centerX, headerOffset + EDGE_MARGIN);
    case 'bottom':
      return clampFabPosition(centerX, window.innerHeight - FAB_SIZE - EDGE_MARGIN);
    case 'right':
    default:
      return clampFabPosition(window.innerWidth - FAB_SIZE - EDGE_MARGIN, lowerY);
  }
}

function readCssPixelValue(variableName: string) {
  if (typeof window === 'undefined') return 0;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
