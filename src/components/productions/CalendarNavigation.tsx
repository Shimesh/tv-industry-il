'use client';

import { useRef } from 'react';
import { Search, X, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

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
    <div className="mb-4 flex flex-col gap-3" dir="rtl">
      <div
        className="rounded-2xl border p-2.5 sm:p-3"
        style={{
          background: 'color-mix(in srgb, var(--theme-bg-secondary) 72%, transparent)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="grid grid-cols-[minmax(76px,1fr)_minmax(132px,1.35fr)_minmax(76px,1fr)] items-stretch gap-2">
          <button
            onClick={onPrev}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-all hover:opacity-80 active:scale-95 sm:text-sm"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span>הקודם</span>
          </button>

          <div
            className="relative flex min-h-11 min-w-0 items-center justify-center rounded-xl border px-2.5"
            style={{
              background: 'var(--theme-bg-primary)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          >
            {onJumpToDate && (
              <button
                onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
                className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  color: 'var(--theme-text-secondary)',
                  border: '1px solid var(--theme-border)',
                }}
                title="קפוץ לתאריך"
                aria-label="קפוץ לתאריך"
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            )}

            <h2 className="min-w-0 px-8 text-center text-sm font-extrabold leading-tight select-none sm:text-base" dir="ltr">
              {loading ? (
                <span
                  className="inline-block h-4 w-24 rounded animate-pulse align-middle"
                  style={{ background: 'var(--theme-bg-secondary)' }}
                />
              ) : (
                periodLabel
              )}
            </h2>

            {onJumpToDate && (
              <input
                ref={dateInputRef}
                type="date"
                className="absolute h-0 w-0 opacity-0 pointer-events-none"
                onChange={(e) => {
                  if (e.target.value) {
                    onJumpToDate(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
            )}
          </div>

          <button
            onClick={onNext}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-all hover:opacity-80 active:scale-95 sm:text-sm"
            style={{
              background: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <span>הבא</span>
            <ChevronLeft className="h-4 w-4 shrink-0" />
          </button>
        </div>

        {!isCurrentPeriod && (
          <button
            onClick={onToday}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-xl px-3 text-sm font-bold transition-all hover:opacity-80 active:scale-95 sm:w-auto"
            style={{
              background: 'var(--theme-accent)',
              color: 'white',
              boxShadow: '0 0 12px color-mix(in srgb, var(--theme-accent) 40%, transparent)',
            }}
          >
            היום
          </button>
        )}

        <div
          className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
        >
          {viewOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className="min-h-10 px-2 text-sm font-bold transition-all"
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

      <div className="relative">
        <Search
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--theme-text-secondary)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חפש הפקה, סטודיו, צוות..."
          className="w-full rounded-xl border py-2.5 pr-9 pl-9 text-sm outline-none transition-all focus:ring-2"
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
            className="absolute left-3 top-1/2 rounded-full p-0.5 -translate-y-1/2 transition-all hover:scale-110"
            style={{
              color: 'var(--theme-text-secondary)',
              background: 'var(--theme-bg-tertiary, rgba(255,255,255,0.1))',
            }}
            aria-label="נקה חיפוש"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
