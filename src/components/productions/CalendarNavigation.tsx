'use client';

import { ChevronRight, ChevronLeft, Search, X, Calendar, List, LayoutGrid } from 'lucide-react';

export type CalendarView = 'week' | 'month' | 'list';

interface CalendarNavigationProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isCurrentPeriod: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean;
}

const viewOptions: { key: CalendarView; label: string; icon: typeof Calendar }[] = [
  { key: 'week', label: 'שבוע', icon: Calendar },
  { key: 'month', label: 'חודש', icon: LayoutGrid },
  { key: 'list', label: 'רשימה', icon: List },
];

export default function CalendarNavigation({
  view,
  onViewChange,
  periodLabel,
  onPrev,
  onNext,
  onToday,
  isCurrentPeriod,
  searchQuery,
  onSearchChange,
  loading = false,
}: CalendarNavigationProps) {
  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* Top row: navigation + view switcher */}
      <div className="flex items-center justify-between gap-2">
        {/* Period navigation */}
        <div className="flex items-center gap-1">
          {/* Right arrow = previous in RTL */}
          <button
            onClick={onPrev}
            className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
            }}
            aria-label="תקופה קודמת"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <h2
            className="text-sm sm:text-lg font-bold min-w-[120px] sm:min-w-[180px] text-center select-none"
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

          {/* Left arrow = next in RTL */}
          <button
            onClick={onNext}
            className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
            }}
            aria-label="תקופה הבאה"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Today button - only when not on current period */}
          {!isCurrentPeriod && (
            <button
              onClick={onToday}
              className="mr-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'var(--theme-accent)',
                color: 'white',
              }}
            >
              היום
            </button>
          )}
        </div>

        {/* View switcher */}
        <div
          className="flex rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          {viewOptions.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-bold transition-all"
              style={{
                background: view === key ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
                color: view === key ? 'white' : 'var(--theme-text-secondary)',
              }}
            >
              <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{label}</span>
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
          className="w-full pr-9 pl-9 py-2 rounded-xl text-sm outline-none transition-all border focus:ring-2"
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
