'use client';

import { useRef } from 'react';
import { Search, X, CalendarDays } from 'lucide-react';

export type CalendarView = 'week' | 'month' | 'list';

interface CalendarNavigationProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJumpToDate?: (dateStr: string) => void;
  isCurrentPeriod: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean;
}

const viewOptions: { key: CalendarView; label: string }[] = [
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'list', label: 'רשימה' },
];

export default function CalendarNavigation({
  view,
  onViewChange,
  periodLabel,
  onPrev,
  onNext,
  onToday,
  onJumpToDate,
  isCurrentPeriod,
  searchQuery,
  onSearchChange,
  loading = false,
}: CalendarNavigationProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* Top row: navigation + view switcher */}
      <div className="flex items-center justify-between gap-2">

        {/* Period navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrev}
            className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all hover:opacity-80 active:scale-95"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
            }}
          >
            הקודם
          </button>

          <h2
            className="text-sm sm:text-base font-bold min-w-[110px] sm:min-w-[160px] text-center select-none"
            style={{ color: 'var(--theme-text)' }}
          >
            {loading ? (
              <span
                className="inline-block w-24 h-5 rounded animate-pulse"
                style={{ background: 'var(--theme-bg-secondary)' }}
              />
            ) : (
              periodLabel
            )}
          </h2>

          <button
            onClick={onNext}
            className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all hover:opacity-80 active:scale-95"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
            }}
          >
            הבא
          </button>

          {/* Date-jump: calendar icon opens native date picker */}
          {onJumpToDate && (
            <div className="relative flex items-center">
              <button
                onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
                className="p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  color: 'var(--theme-text-secondary)',
                  border: '1px solid var(--theme-border)',
                }}
                title="קפוץ לתאריך"
                aria-label="קפוץ לתאריך"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                onChange={(e) => {
                  if (e.target.value) {
                    onJumpToDate(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          )}

          {!isCurrentPeriod && (
            <button
              onClick={onToday}
              className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all hover:opacity-80 active:scale-95"
              style={{
                background: 'var(--theme-accent)',
                color: 'white',
                boxShadow: '0 0 12px color-mix(in srgb, var(--theme-accent) 40%, transparent)',
              }}
            >
              היום
            </button>
          )}
        </div>

        {/* View switcher — text only */}
        <div
          className="flex rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          {viewOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className="px-3 py-1.5 text-xs font-bold transition-all"
              style={{
                background: view === key
                  ? 'var(--theme-accent)'
                  : 'var(--theme-bg-secondary)',
                color: view === key ? 'white' : 'var(--theme-text-secondary)',
                boxShadow: view === key
                  ? 'inset 0 1px 0 rgba(255,255,255,0.15)'
                  : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--theme-text-secondary)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חפש הפקה, סטודיו, צוות..."
          className="w-full pr-9 pl-9 py-2.5 rounded-xl text-sm outline-none transition-all border focus:ring-2"
          style={{
            background: 'var(--theme-bg-secondary)',
            color: 'var(--theme-text)',
            borderColor: 'var(--theme-border)',
            // @ts-expect-error CSS custom property for ring color
            '--tw-ring-color': 'var(--theme-accent)',
          }}
          dir="rtl"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-all hover:scale-110"
            style={{
              color: 'var(--theme-text-secondary)',
              background: 'var(--theme-bg-tertiary, rgba(255,255,255,0.1))',
            }}
            aria-label="נקה חיפוש"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
