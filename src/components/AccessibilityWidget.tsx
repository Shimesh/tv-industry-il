'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Accessibility, Contrast, PauseCircle, RotateCcw, Type, X } from 'lucide-react';

type AccessibilitySettings = {
  highContrast: boolean;
  largeText: boolean;
  stopAnimations: boolean;
};

type WidgetPosition = {
  x: number;
  y: number;
};

type MenuSize = {
  width: number;
  height: number;
};

const STORAGE_KEY = 'tv-industry-il-accessibility';
const POSITION_STORAGE_KEY = 'tv-industry-il-accessibility-position';
const FAB_SIZE = 56;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD = 5;
const MENU_WIDTH = 288;
const MENU_FALLBACK_HEIGHT = 286;
const MENU_GAP = 12;

const defaultSettings: AccessibilitySettings = {
  highContrast: false,
  largeText: false,
  stopAnimations: false,
};

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [position, setPosition] = useState<WidgetPosition>({ x: EDGE_MARGIN, y: EDGE_MARGIN });
  const [menuSize, setMenuSize] = useState<MenuSize>({
    width: MENU_WIDTH,
    height: MENU_FALLBACK_HEIGHT,
  });
  const panelId = useId();
  const widgetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const justDraggedRef = useRef(false);
  const settingsStorageReadyRef = useRef(false);
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
    try {
      const savedSettings = window.localStorage.getItem(STORAGE_KEY);
      if (savedSettings) {
        setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
      }
    } catch {
      // Ignore malformed or unavailable stored settings.
    }

    try {
      const savedPosition = window.localStorage.getItem(POSITION_STORAGE_KEY);
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition) as WidgetPosition;
        setPosition(clampPosition(parsed.x, parsed.y));
        return;
      }
    } catch {
      // Fall back to the default corner.
    }

    setPosition({
      x: EDGE_MARGIN,
      y: window.innerHeight - FAB_SIZE - EDGE_MARGIN,
    });
  }, []);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    body.classList.toggle('accessibility-high-contrast', settings.highContrast);
    html.classList.toggle('accessibility-large-text', settings.largeText);
    body.classList.toggle('accessibility-stop-animations', settings.stopAnimations);

    if (!settingsStorageReadyRef.current) {
      settingsStorageReadyRef.current = true;
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Accessibility preferences are progressive enhancement; ignore storage failures.
    }
  }, [settings]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => clampPosition(current.x, current.y));
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        setMenuSize({ width: rect.width, height: rect.height });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!positionStorageReadyRef.current) {
      positionStorageReadyRef.current = true;
      return;
    }

    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      // Position memory is progressive enhancement; ignore storage failures.
    }
  }, [position]);

  useEffect(() => {
    if (!open || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    setMenuSize({ width: rect.width, height: rect.height });
  }, [open]);

  const toggleSetting = (key: keyof AccessibilitySettings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    setOpen(false);
  };

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = {
      active: true,
      moved: false,
      startClientX: clientX,
      startClientY: clientY,
      startX: position.x,
      startY: position.y,
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
      setOpen(false);
    }

    setPosition(clampPosition(drag.startX + deltaX, drag.startY + deltaY));
  };

  const finishDrag = () => {
    if (dragRef.current.moved) {
      justDraggedRef.current = true;
    }

    dragRef.current.active = false;
    setIsDragging(false);
  };

  const handleFabClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }

    setOpen((current) => !current);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    startDrag(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
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

  const hasActiveSettings = Object.values(settings).some(Boolean);
  const menuStyle = getMenuStyle(position, menuSize);

  return (
    <div
      ref={widgetRef}
      className="fixed z-[80]"
      dir="rtl"
      style={{
        left: position.x,
        top: position.y,
        width: FAB_SIZE,
        height: FAB_SIZE,
      }}
    >
      {open && (
        <section
          ref={menuRef}
          id={panelId}
          aria-label="הגדרות נגישות"
          className="fixed w-72 overflow-hidden rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--theme-text)] shadow-2xl max-[360px]:w-[calc(100vw-2rem)]"
          style={menuStyle}
        >
          <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
            <h2 className="text-sm font-bold">הגדרות נגישות</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-2 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
              aria-label="סגירת תפריט נגישות"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2 p-3">
            <ToggleButton
              active={settings.highContrast}
              icon={<Contrast className="h-5 w-5" aria-hidden="true" />}
              label="ניגודיות גבוהה"
              onClick={() => toggleSetting('highContrast')}
            />
            <ToggleButton
              active={settings.largeText}
              icon={<Type className="h-5 w-5" aria-hidden="true" />}
              label="טקסט גדול"
              onClick={() => toggleSetting('largeText')}
            />
            <ToggleButton
              active={settings.stopAnimations}
              icon={<PauseCircle className="h-5 w-5" aria-hidden="true" />}
              label="עצירת אנימציות"
              onClick={() => toggleSetting('stopAnimations')}
            />

            <button
              type="button"
              onClick={resetSettings}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2.5 text-sm font-semibold text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasActiveSettings}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              איפוס הגדרות
            </button>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={handleFabClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-accent)] text-white shadow-2xl transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[var(--theme-accent-glow)] ${
          isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'
        }`}
        aria-label={open ? 'סגירת תפריט נגישות' : 'פתיחת תפריט נגישות'}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Accessibility className="h-7 w-7" aria-hidden="true" />
      </button>
    </div>
  );
}

function clampPosition(x: number, y: number): WidgetPosition {
  if (typeof window === 'undefined') return { x, y };

  const minX = EDGE_MARGIN;
  const minY = EDGE_MARGIN;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - FAB_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - FAB_SIZE - EDGE_MARGIN);

  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

function getMenuStyle(position: WidgetPosition, menuSize: MenuSize): CSSProperties {
  if (typeof window === 'undefined') return {};

  const opensLeft = position.x + FAB_SIZE / 2 > window.innerWidth / 2;
  const opensUp = position.y + FAB_SIZE / 2 > window.innerHeight / 2;
  const desiredLeft = opensLeft
    ? position.x - MENU_GAP - menuSize.width
    : position.x + FAB_SIZE + MENU_GAP;
  const desiredTop = opensUp
    ? position.y + FAB_SIZE - menuSize.height
    : position.y;
  const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - menuSize.width - EDGE_MARGIN);
  const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - menuSize.height - EDGE_MARGIN);

  return {
    left: Math.min(Math.max(desiredLeft, EDGE_MARGIN), maxLeft),
    top: Math.min(Math.max(desiredTop, EDGE_MARGIN), maxTop),
  };
}

function ToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] ${
        active
          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-glow)] text-[var(--theme-text)]'
          : 'border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text)]'
      }`}
      aria-pressed={active}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--theme-bg-secondary)] text-[var(--theme-accent)]">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          active ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]' : 'border-[var(--theme-border)] bg-[var(--theme-bg)]'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
            active ? 'right-6' : 'right-1'
          }`}
        />
      </span>
    </button>
  );
}
